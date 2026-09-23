import { describe, beforeEach, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { MongoClient, ObjectId } from 'mongodb'

import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { DATABASE_NAME } from '#vite/fixtures/mongo-client.js'
import { createTestServer } from '#test/create-test-server.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { createMongoSummaryLogRowStatesRepository } from '#waste-records/repository/mongodb.js'
import { createReportsRepository } from '#reports/repository/mongodb.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  MATERIAL,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import {
  buildAccreditation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { partialMock } from '#test/type-helpers.js'
import { marketInsightsWasteBalancePath } from './waste-balance-get.js'

const januaryToFebruary2026 = marketInsightsWasteBalancePath
  .replace('{year}', '2026')
  .replace('{cadence}', 'monthly')
  .replace('{period}', '2')

/** @import { Db } from 'mongodb' */
/** @import { TestServer } from '#test/create-test-server.js' */

/**
 * @typedef {TestServer & {
 *   db: Db,
 *   repositories: {
 *     ledgerRepository: import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository,
 *     organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
 *     overseasSitesRepository: import('#overseas-sites/repository/port.js').OverseasSitesRepository,
 *     summaryLogRowStatesRepository: import('#waste-records/repository/port.js').SummaryLogRowStatesRepository,
 *     reportsRepository: import('#reports/repository/port.js').ReportsRepository
 *   }
 * }} TestServerWithRealDb
 */

/**
 * A server whose every repository this route reads through is the MongoDB
 * adapter, over one in-memory Mongo that the test also seeds. The shared
 * `server-with-real-db` fixture wires only `db` and the ledger, which suits a
 * route that queries mongo directly; this route reads through five ports and
 * has to exercise all five adapters.
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
              ledgerRepository: (await createMongoLedgerRepository(mongoDb))(),
              organisationsRepository: (
                await createOrganisationsRepository(mongoDb)
              )(),
              overseasSitesRepository: (
                await createOverseasSitesRepository(mongoDb)
              )(),
              summaryLogRowStatesRepository: (
                await createMongoSummaryLogRowStatesRepository(mongoDb)
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

const summaryLogId = 'sl-REG-001'

/**
 * An approved plastic reprocessor accredited for 2026, written through the
 * organisations fixture so the document the route reads back is one the write
 * schema accepts.
 *
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository
 */
const insertAccreditedOperator = async (organisationsRepository) => {
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
  const organisation = await buildApprovedOrg(
    organisationsRepository,
    { registrations: [registration], accreditations: [accreditation] },
    { VALID_FROM: '2026-01-01', VALID_TO: '2026-12-31' }
  )

  return {
    organisationId: organisation.id,
    registrationId: registration.id,
    accreditationId
  }
}

const STAMPED_EXCLUDED = {
  outcome: WASTE_BALANCE_OUTCOME.EXCLUDED,
  reasons: [],
  transactionAmount: 0
}

/**
 * A received load carrying every field the waste-balance classifier reads.
 * Stamped as counting for nothing, so a table reading the stamp rather than
 * re-deriving cannot produce the expected figures.
 */
const receivedRow = (rowId, date, tonnage) => ({
  rowId,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  data: {
    DATE_RECEIVED_FOR_REPROCESSING: date,
    EWC_CODE: '15 01 02',
    DESCRIPTION_WASTE: 'Plastic packaging',
    WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
    GROSS_WEIGHT: tonnage + 1,
    TARE_WEIGHT: 1,
    PALLET_WEIGHT: 0,
    NET_WEIGHT: tonnage,
    BAILING_WIRE_PROTOCOL: 'No',
    HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Sampling',
    WEIGHT_OF_NON_TARGET_MATERIALS: 0,
    RECYCLABLE_PROPORTION_PERCENTAGE: 100,
    TONNAGE_RECEIVED_FOR_RECYCLING: tonnage
  },
  classification: STAMPED_EXCLUDED
})

const sentOnRow = (rowId, tonnage) => ({
  rowId,
  wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  data: {
    DATE_LOAD_LEFT_SITE: '2026-02-20',
    TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: tonnage
  },
  classification: STAMPED_EXCLUDED
})

/**
 * Seed one submission through the write side of the same adapters the route
 * reads back through, so no test builds a stored document by hand. The
 * operator has submitted its January report and no other.
 *
 * @param {TestServerWithRealDb['repositories']} repositories
 * @param {import('#waste-records/repository/schema.js').SummaryLogRowStateEntry[]} rows
 */
const submit = async (repositories, rows) => {
  const ledgerId = await insertAccreditedOperator(
    repositories.organisationsRepository
  )

  await buildSubmittedReport(repositories.reportsRepository, {
    organisationId: ledgerId.organisationId,
    registrationId: ledgerId.registrationId,
    year: 2026,
    cadence: 'monthly',
    period: 1
  })
  await repositories.summaryLogRowStatesRepository.upsertSummaryLogRowStates(
    ledgerId,
    rows,
    summaryLogId
  )
  await repositories.ledgerRepository.appendEvents([
    partialMock(
      buildLedgerEvent({
        ...ledgerId,
        number: 1,
        payload: { summaryLogId, creditTotal: 0 }
      })
    )
  ])
}

describe(`GET ${marketInsightsWasteBalancePath} (integration)`, () => {
  setupAuthContext()

  beforeEach(
    async (/** @type {{ server: TestServerWithRealDb }} */ { server }) => {
      for (const { name } of await server.db.listCollections().toArray()) {
        await server.db.collection(name).deleteMany({})
      }
    }
  )

  it('serves the waste balance figures up to the requested period to a regulator holding market-data.read', async ({
    server
  }) => {
    await submit(server.repositories, [
      receivedRow('row-1', '2026-02-10', 100),
      receivedRow('row-after-the-period', '2026-03-10', 999),
      sentOnRow('row-sent-on', 30)
    ])

    const response = await server.inject({
      method: 'GET',
      url: januaryToFebruary2026,
      headers: { Authorization: `Bearer ${regulatorToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    /** @type {import('#market-insights/application/waste-balance-table.js').WasteBalanceTable} */
    const payload = JSON.parse(response.payload)

    const { months, period } = payload.data
    expect(months['2026-02'].figures.plastic.reprocessor).toEqual({
      totalCredited: 100,
      eligibleForWasteBalance: 100,
      sentOnDeductions: 30,
      netCredit: 70,
      operatorCount: 1,
      submittingOperatorCount: 1
    })
    expect(months['2026-02'].figures.wood.exporter).toEqual({
      totalCredited: 0,
      eligibleForWasteBalance: 0,
      sentOnDeductions: 0,
      netCredit: 0,
      operatorCount: 0,
      submittingOperatorCount: 0
    })
    expect(
      Object.values(months).flatMap(({ figures }) =>
        Object.values(figures).flatMap((byAccreditationType) =>
          Object.values(byAccreditationType).filter(
            ({ totalCredited }) => totalCredited !== 0
          )
        )
      )
    ).toHaveLength(1)
    expect(months['2026-01'].reports).toEqual({ expected: 1, submitted: 1 })
    expect(months['2026-02'].reports).toEqual({ expected: 1, submitted: 0 })
    expect(period).toEqual({ reports: { expected: 2, submitted: 1 } })
  })

  it('refuses a caller holding no market-data.read', async ({ server }) => {
    await submit(server.repositories, [receivedRow('row-1', '2026-02-10', 100)])

    const response = await server.inject({
      method: 'GET',
      url: januaryToFebruary2026,
      headers: { Authorization: `Bearer ${nonServiceMaintainerUserToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })
})
