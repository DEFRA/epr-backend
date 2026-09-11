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
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { partialMock } from '#test/type-helpers.js'
import { marketInsightsWasteBalancePath } from './waste-balance-get.js'

/** @import { Db } from 'mongodb' */
/** @import { TestServer } from '#test/create-test-server.js' */

/**
 * @typedef {TestServer & {
 *   db: Db,
 *   repositories: {
 *     ledgerRepository: import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository,
 *     organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
 *     overseasSitesRepository: import('#overseas-sites/repository/port.js').OverseasSitesRepository,
 *     summaryLogRowStatesRepository: import('#waste-records/repository/port.js').SummaryLogRowStatesRepository
 *   }
 * }} TestServerWithRealDb
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
              )()
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

const approvedHistory = [
  { status: ACCREDITATION_STATUS.CREATED, updatedAt: '2025-11-01' },
  { status: ACCREDITATION_STATUS.APPROVED, updatedAt: '2025-12-01' }
]

const summaryLogId = 'sl-REG-001'

/**
 * An accredited plastic reprocessor built from the organisations fixture, so
 * the document the route reads back is one the write schema accepts.
 */
const buildAccreditedOperator = () => {
  const accreditationId = new ObjectId().toString()
  const registration = buildRegistration({
    accreditationId,
    material: MATERIAL.PLASTIC,
    wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
    reprocessingType: REPROCESSING_TYPE.INPUT,
    glassRecyclingProcess: null,
    statusHistory: approvedHistory
  })
  const accreditation = buildAccreditation({
    id: accreditationId,
    material: MATERIAL.PLASTIC,
    wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
    reprocessingType: REPROCESSING_TYPE.INPUT,
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    glassRecyclingProcess: null,
    statusHistory: approvedHistory
  })
  const organisation = buildOrganisation({
    registrations: [registration],
    accreditations: [accreditation]
  })

  return {
    organisation,
    ledgerId: {
      organisationId: organisation.id,
      registrationId: registration.id,
      accreditationId
    }
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
 * reads back through, so no test builds a stored document by hand.
 *
 * @param {TestServerWithRealDb['repositories']} repositories
 * @param {import('#waste-records/repository/schema.js').SummaryLogRowStateEntry[]} rows
 */
const submit = async (repositories, rows) => {
  const { organisation, ledgerId } = buildAccreditedOperator()

  await repositories.organisationsRepository.insert(organisation)
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

  it('serves the waste balance figures to a regulator holding market-data.read', async ({
    server
  }) => {
    await submit(server.repositories, [
      receivedRow('row-1', '2026-02-10', 100),
      sentOnRow('row-sent-on', 30)
    ])

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
    await submit(server.repositories, [receivedRow('row-1', '2026-02-10', 100)])

    const response = await server.inject({
      method: 'GET',
      url: `${marketInsightsWasteBalancePath}?year=2026`,
      headers: { Authorization: `Bearer ${nonServiceMaintainerUserToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })
})
