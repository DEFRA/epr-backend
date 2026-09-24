import { describe, beforeEach, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { MongoClient } from 'mongodb'

import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { DATABASE_NAME } from '#vite/fixtures/mongo-client.js'
import { createTestServer } from '#test/create-test-server.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createReportsRepository } from '#reports/repository/mongodb.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { insertAccreditedOperator } from '#vite/helpers/insert-accredited-operator.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { NATION, REGULATOR } from '#domain/organisations/model.js'
import {
  marketInsightsNationReprocessorExporterFiguresPath,
  marketInsightsReprocessorExporterFiguresPath
} from './reprocessor-exporter-figures-get.js'

/** @param {string} path */
const januaryToFebruary2026For = (path) =>
  path
    .replace('{year}', '2026')
    .replace('{cadence}', 'monthly')
    .replace('{period}', '2')

const januaryToFebruary2026 = januaryToFebruary2026For(
  marketInsightsReprocessorExporterFiguresPath
)

/** @import { Db } from 'mongodb' */
/** @import { TestServer } from '#test/create-test-server.js' */
/** @import { ReprocessorExporterTable } from '#market-insights/application/reprocessor-exporter-table.js' */

/**
 * @typedef {TestServer & {
 *   db: Db,
 *   repositories: {
 *     organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
 *     reportsRepository: import('#reports/repository/port.js').ReportsRepository
 *   }
 * }} TestServerWithRealDb
 */

/**
 * A server whose organisations and reports repositories are the MongoDB
 * adapters, over one in-memory Mongo that the test also seeds, so the
 * latest-submission collapse is exercised against the stored projection.
 */
const it =
  /** @type {import('vitest').TestAPI<{ server: TestServerWithRealDb }>} */ (
    mongoIt.extend({
      server: [
        async (/** @type {{ db: string }} */ { db }, use) => {
          const client = await MongoClient.connect(db)
          try {
            const mongoDb = client.db(DATABASE_NAME)
            const repositories = {
              organisationsRepository: (
                await createOrganisationsRepository(mongoDb)
              )(),
              reportsRepository: (await createReportsRepository(mongoDb))()
            }
            const server = await createTestServer({ db: mongoDb, repositories })

            await use(
              /** @type {TestServerWithRealDb} */ (
                Object.assign(server, { repositories })
              )
            )

            await server.stop()
          } finally {
            await client.close()
          }
        },
        { scope: 'file' }
      ]
    })
  )

const { regulatorToken, nonServiceMaintainerUserToken } = entraIdMockAuthTokens

/**
 * Seed one operator's January report, submitted twice, through the write side
 * of the same adapters the route reads back through.
 *
 * @param {TestServerWithRealDb['repositories']} repositories
 */
const submitJanuaryTwice = async (repositories) => {
  const operator = await insertAccreditedOperator(
    repositories.organisationsRepository
  )
  const january = { ...operator, year: 2026, cadence: 'monthly', period: 1 }

  await buildSubmittedReport(repositories.reportsRepository, {
    ...january,
    prn: {
      issuedTonnage: 80,
      freeTonnage: 5,
      totalRevenue: 40000,
      averagePricePerTonne: 533.33
    }
  })
  await buildSubmittedReport(repositories.reportsRepository, {
    ...january,
    submissionNumber: 2,
    recyclingActivity: {
      suppliers: [],
      totalTonnageReceived: 100,
      tonnageRecycled: 90,
      tonnageNotRecycled: 10
    },
    wasteSent: {
      tonnageSentToReprocessor: 1,
      tonnageSentToExporter: 2,
      tonnageSentToAnotherSite: 3,
      finalDestinations: []
    },
    prn: {
      issuedTonnage: 120,
      freeTonnage: 8,
      totalRevenue: 60000,
      averagePricePerTonne: 535.71
    }
  })
}

describe(`GET ${marketInsightsReprocessorExporterFiguresPath} (integration)`, () => {
  setupAuthContext()

  beforeEach(
    async (/** @type {{ server: TestServerWithRealDb }} */ { server }) => {
      for (const { name } of await server.db.listCollections().toArray()) {
        await server.db.collection(name).deleteMany({})
      }
    }
  )

  it('serves the latest submission of each period up to the requested one to a regulator holding market-data.read', async ({
    server
  }) => {
    await submitJanuaryTwice(server.repositories)

    const response = await server.inject({
      method: 'GET',
      url: januaryToFebruary2026,
      headers: { Authorization: `Bearer ${regulatorToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    /** @type {ReprocessorExporterTable} */
    const payload = JSON.parse(response.payload)

    const { months } = payload.data
    expect(Object.keys(months)).toEqual(['2026-01', '2026-02'])
    expect(months['2026-01'].figures.plastic.reprocessor).toEqual({
      tonnageReceived: 100,
      tonnageRecycled: 90,
      tonnageReceivedButNotRecycled: 10,
      tonnageSentOnTotal: 6,
      tonnageSentOnToReprocessor: 1,
      tonnageSentOnToExporter: 2,
      tonnageSentOnToOtherFacilities: 3,
      revisedTonnageIssued: 112,
      totalRevenue: 60000,
      averagePricePerTonne: 535.71,
      operatorCount: 1,
      submittingOperatorCount: 1,
      contributingOperatorCounts: {
        tonnageReceived: 1,
        tonnageRecycled: 1,
        tonnageReceivedButNotRecycled: 1,
        tonnageSentOnTotal: 1,
        tonnageSentOnToReprocessor: 1,
        tonnageSentOnToExporter: 1,
        tonnageSentOnToOtherFacilities: 1,
        revisedTonnageIssued: 1,
        totalRevenue: 1,
        averagePricePerTonne: 1
      }
    })
    expect(months['2026-02'].figures.plastic.reprocessor.tonnageReceived).toBe(
      0
    )
    expect(months['2026-01'].figures.wood.exporter.tonnageExported).toBe(0)
  })

  it('refuses a caller holding no market-data.read', async ({ server }) => {
    await submitJanuaryTwice(server.repositories)

    const response = await server.inject({
      method: 'GET',
      url: januaryToFebruary2026,
      headers: { Authorization: `Bearer ${nonServiceMaintainerUserToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })
})

const englandFiguresPath =
  marketInsightsNationReprocessorExporterFiguresPath.replace(
    '{nation}',
    NATION.ENGLAND
  )

describe(`GET ${marketInsightsNationReprocessorExporterFiguresPath} (integration)`, () => {
  setupAuthContext()

  beforeEach(
    async (/** @type {{ server: TestServerWithRealDb }} */ { server }) => {
      for (const { name } of await server.db.listCollections().toArray()) {
        await server.db.collection(name).deleteMany({})
      }
    }
  )

  it('serves the registrations submitted to the Environment Agency alone, from the documents the UK figures read', async ({
    server
  }) => {
    await submitJanuaryTwice(server.repositories)
    const welsh = await insertAccreditedOperator(
      server.repositories.organisationsRepository,
      REGULATOR.NRW
    )
    await buildSubmittedReport(server.repositories.reportsRepository, {
      ...welsh,
      year: 2026,
      cadence: 'monthly',
      period: 1,
      prn: {
        issuedTonnage: 1000,
        freeTonnage: 0,
        totalRevenue: 100000,
        averagePricePerTonne: 100
      }
    })

    const [england, uk] = await Promise.all(
      [englandFiguresPath, marketInsightsReprocessorExporterFiguresPath].map(
        (path) =>
          server.inject({
            method: 'GET',
            url: januaryToFebruary2026For(path),
            headers: { Authorization: `Bearer ${regulatorToken}` }
          })
      )
    )

    expect(england.statusCode).toBe(StatusCodes.OK)
    /** @type {ReprocessorExporterTable} */
    const englandPayload = JSON.parse(england.payload)
    /** @type {ReprocessorExporterTable} */
    const ukPayload = JSON.parse(uk.payload)
    expect(
      englandPayload.data.months['2026-01'].figures.plastic.reprocessor
    ).toEqual(
      expect.objectContaining({
        revisedTonnageIssued: 112,
        totalRevenue: 60000,
        operatorCount: 1,
        submittingOperatorCount: 1
      })
    )
    expect(
      ukPayload.data.months['2026-01'].figures.plastic.reprocessor
    ).toEqual(
      expect.objectContaining({
        revisedTonnageIssued: 1112,
        totalRevenue: 160000,
        operatorCount: 2,
        submittingOperatorCount: 2,
        contributingOperatorCounts: expect.objectContaining({
          revisedTonnageIssued: 2,
          totalRevenue: 2
        })
      })
    )
  })
})
