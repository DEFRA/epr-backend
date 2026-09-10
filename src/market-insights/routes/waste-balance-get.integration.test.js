import { describe, beforeEach, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { MongoClient, ObjectId } from 'mongodb'

import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { DATABASE_NAME } from '#vite/fixtures/mongo-client.js'
import { createTestServer } from '#test/create-test-server.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import {
  createMongoSummaryLogRowStatesRepository,
  SUMMARY_LOG_ROW_STATES_COLLECTION_NAME
} from '#waste-records/repository/mongodb.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  ACCREDITATION_STATUS,
  MATERIAL,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { WASTE_BALANCE_EVENTS_COLLECTION_NAME } from '#waste-balances/repository/ledger-mongodb.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { marketInsightsWasteBalancePath } from './waste-balance-get.js'

/** @import { Db } from 'mongodb' */
/** @import { TestServer } from '#test/create-test-server.js' */

/**
 * @typedef {TestServer & { db: Db }} TestServerWithRealDb
 */

/**
 * A server whose every repository this route reads through is the MongoDB
 * adapter, over one in-memory Mongo that the test also seeds. The shared
 * `server-with-real-db` fixture wires only `db` and the ledger, which suits a
 * route that queries mongo directly; this route reads through four ports and
 * has to exercise all four adapters.
 */
const it =
  /** @type {import('vitest').TestAPI<{ server: TestServerWithRealDb }>} */ (
    mongoIt.extend({
      server: [
        async (/** @type {{ db: string }} */ { db }, use) => {
          const client = await MongoClient.connect(db)
          try {
            const mongoDb = client.db(DATABASE_NAME)
            const server = await createTestServer({
              db: mongoDb,
              repositories: {
                ledgerRepository: (
                  await createMongoLedgerRepository(mongoDb)
                )(),
                organisationsRepository: (
                  await createOrganisationsRepository(mongoDb)
                )(),
                overseasSitesRepository: (
                  await createOverseasSitesRepository(mongoDb)
                )(),
                summaryLogRowStatesRepository: (
                  await createMongoSummaryLogRowStatesRepository(mongoDb)
                )()
              }
            })

            await use(/** @type {TestServerWithRealDb} */ (server))

            await server.stop()
          } finally {
            await client.close()
          }
        },
        { scope: 'file' }
      ]
    })
  )

const ORGANISATIONS_COLLECTION = 'epr-organisations'
const { regulatorToken, nonServiceMaintainerUserToken } = entraIdMockAuthTokens

const orgId = '507f1f77bcf86cd799439011'
const regId = 'REG-001'
const accreditationId = 'ACC-001'
const summaryLogId = 'sl-REG-001'

const approvedHistory = [
  { status: ACCREDITATION_STATUS.CREATED, updatedAt: '2025-11-01' },
  { status: ACCREDITATION_STATUS.APPROVED, updatedAt: '2025-12-01' }
]

/** @param {Db} db */
const seedAccreditedOrganisation = (db) =>
  db.collection(ORGANISATIONS_COLLECTION).insertOne({
    _id: new ObjectId(orgId),
    orgId: 500123,
    statusHistory: approvedHistory,
    registrations: [
      {
        id: regId,
        accreditationId,
        statusHistory: approvedHistory,
        material: MATERIAL.PLASTIC,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        reprocessingType: REPROCESSING_TYPE.INPUT
      }
    ],
    accreditations: [
      {
        id: accreditationId,
        accreditationNumber: 'ACC-500123',
        statusHistory: approvedHistory,
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        material: MATERIAL.PLASTIC,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        reprocessingType: REPROCESSING_TYPE.INPUT
      }
    ]
  })

/**
 * A received load carrying every field the waste-balance classifier reads.
 * Stamped as counting for nothing, so a table reading the stamp rather than
 * re-deriving cannot produce the expected figures.
 *
 * @param {Db} db
 * @param {string} rowId
 * @param {string} date
 * @param {number} tonnage
 */
const seedReceivedRow = (db, rowId, date, tonnage) =>
  db.collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME).insertOne({
    organisationId: orgId,
    registrationId: regId,
    accreditationId,
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
    classification: {
      outcome: WASTE_BALANCE_OUTCOME.EXCLUDED,
      reasons: [],
      transactionAmount: 0
    },
    summaryLogIds: [summaryLogId]
  })

/**
 * @param {Db} db
 * @param {number} tonnage
 */
const seedSentOnRow = (db, tonnage) =>
  db.collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME).insertOne({
    organisationId: orgId,
    registrationId: regId,
    accreditationId,
    rowId: 'row-sent-on',
    wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
    data: {
      DATE_LOAD_LEFT_SITE: '2026-02-20',
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: tonnage
    },
    classification: {
      outcome: WASTE_BALANCE_OUTCOME.EXCLUDED,
      reasons: [],
      transactionAmount: 0
    },
    summaryLogIds: [summaryLogId]
  })

/** @param {Db} db */
const seedSubmittedSummaryLog = (db) =>
  db.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME).insertOne({
    organisationId: orgId,
    registrationId: regId,
    accreditationId,
    number: 1,
    kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
    payload: { summaryLogId, creditTotal: 0 }
  })

describe(`GET ${marketInsightsWasteBalancePath} (integration)`, () => {
  setupAuthContext()

  beforeEach(
    async (/** @type {{ server: TestServerWithRealDb }} */ { server }) => {
      await server.db.collection(ORGANISATIONS_COLLECTION).deleteMany({})
      await server.db
        .collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME)
        .deleteMany({})
      await server.db
        .collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
        .deleteMany({})
    }
  )

  it('serves the waste balance figures to a regulator holding market-data.read', async ({
    server
  }) => {
    await seedAccreditedOrganisation(server.db)
    await seedReceivedRow(server.db, 'row-1', '2026-02-10', 100)
    await seedSentOnRow(server.db, 30)
    await seedSubmittedSummaryLog(server.db)

    const response = await server.inject({
      method: 'GET',
      url: `${marketInsightsWasteBalancePath}?year=2026`,
      headers: { Authorization: `Bearer ${regulatorToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const payload = JSON.parse(response.payload)

    expect(payload.meta.reportingYear).toBe(2026)
    expect(payload.data).toEqual([
      {
        material: MATERIAL.PLASTIC,
        accreditationType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        month: '2026-02',
        totalCredited: 100,
        eligibleForWasteBalance: 100,
        sentOnDeductions: 30,
        netCredit: 70
      }
    ])
  })

  it('refuses a caller holding no market-data.read', async ({ server }) => {
    await seedAccreditedOrganisation(server.db)
    await seedReceivedRow(server.db, 'row-1', '2026-02-10', 100)
    await seedSubmittedSummaryLog(server.db)

    const response = await server.inject({
      method: 'GET',
      url: `${marketInsightsWasteBalancePath}?year=2026`,
      headers: { Authorization: `Bearer ${nonServiceMaintainerUserToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })
})
