import { describe, beforeEach, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { MongoClient, ObjectId } from 'mongodb'

import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { DATABASE_NAME } from '#vite/fixtures/mongo-client.js'
import { createTestServer } from '#test/create-test-server.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createReportsRepository } from '#reports/repository/mongodb.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import {
  MATERIAL,
  REPROCESSING_TYPE,
  TONNAGE_BAND,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  buildAccreditation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { marketInsightsOutstandingReturnsPath } from './outstanding-returns-get.js'

const januaryToFebruary2026 = marketInsightsOutstandingReturnsPath
  .replace('{year}', '2026')
  .replace('{cadence}', 'monthly')
  .replace('{period}', '2')

/** @import { Db } from 'mongodb' */
/** @import { TestServer } from '#test/create-test-server.js' */

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
 * A server whose two repositories this route reads through are the MongoDB
 * adapters, over one in-memory Mongo that the test also seeds.
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
 * An approved plastic reprocessor in the over 10,000 tonnes band, accredited
 * for 2026, which has submitted its January report and no other.
 *
 * @param {TestServerWithRealDb['repositories']} repositories
 */
const seedOperatorOwingFebruary = async ({
  organisationsRepository,
  reportsRepository
}) => {
  const accreditationId = new ObjectId().toString()
  const registration = buildRegistration({
    accreditationId,
    material: MATERIAL.PLASTIC,
    wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
    reprocessingType: REPROCESSING_TYPE.INPUT,
    glassRecyclingProcess: null
  })
  const accreditation = buildAccreditation({
    id: accreditationId,
    material: MATERIAL.PLASTIC,
    wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
    reprocessingType: REPROCESSING_TYPE.INPUT,
    glassRecyclingProcess: null
  })
  accreditation.prnIssuance.tonnageBand = TONNAGE_BAND.OVER_10000
  const organisation = await buildApprovedOrg(
    organisationsRepository,
    { registrations: [registration], accreditations: [accreditation] },
    { VALID_FROM: '2026-01-01', VALID_TO: '2026-12-31' }
  )

  await buildSubmittedReport(reportsRepository, {
    organisationId: organisation.id,
    registrationId: registration.id,
    year: 2026,
    cadence: 'monthly',
    period: 1
  })
}

describe(`GET ${marketInsightsOutstandingReturnsPath} (integration)`, () => {
  setupAuthContext()

  beforeEach(
    async (/** @type {{ server: TestServerWithRealDb }} */ { server }) => {
      for (const { name } of await server.db.listCollections().toArray()) {
        await server.db.collection(name).deleteMany({})
      }
    }
  )

  it('serves the outstanding returns up to the requested period to a regulator holding market-data.read', async ({
    server
  }) => {
    await seedOperatorOwingFebruary(server.repositories)

    const response = await server.inject({
      method: 'GET',
      url: januaryToFebruary2026,
      headers: { Authorization: `Bearer ${regulatorToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    /** @type {import('#market-insights/application/outstanding-returns.js').OutstandingReturnsTable} */
    const payload = JSON.parse(response.payload)

    const { months } = payload.data
    expect(months).toMatchObject({
      '2026-01': { figures: { plastic: { over_10000: 0 } } },
      '2026-02': { figures: { plastic: { over_10000: 1 } } }
    })
    expect(
      Object.values(months).flatMap(({ figures }) =>
        Object.values(figures).flatMap((byBand) =>
          Object.values(byBand).filter((n) => n !== 0)
        )
      )
    ).toHaveLength(1)
  })

  it('refuses a caller holding no market-data.read', async ({ server }) => {
    const response = await server.inject({
      method: 'GET',
      url: januaryToFebruary2026,
      headers: { Authorization: `Bearer ${nonServiceMaintainerUserToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })
})
