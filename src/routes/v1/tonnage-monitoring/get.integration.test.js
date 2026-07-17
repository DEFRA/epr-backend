import { describe, beforeEach, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'

import { it } from '#vite/fixtures/server-with-real-db.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { MATERIAL } from '#domain/organisations/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { SUMMARY_LOG_ROW_STATES_COLLECTION_NAME } from '#waste-records/repository/mongodb.js'
import { WASTE_BALANCE_EVENTS_COLLECTION_NAME } from '#waste-balances/repository/ledger-mongodb.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { tonnageMonitoringPath } from './get.js'

/** @import { Db } from 'mongodb' */
/** @import { TestServerWithRealDb } from '#vite/fixtures/server-with-real-db.js' */

const ORGANISATIONS_COLLECTION = 'epr-organisations'
const { validToken } = entraIdMockAuthTokens

const orgId = '507f1f77bcf86cd799439011'
const regId = 'REG-001'
const summaryLogId = 'sl-REG-001'

/** @param {Db} db */
const seedOrganisation = (db) =>
  db.collection(ORGANISATIONS_COLLECTION).insertOne({
    _id: new ObjectId(orgId),
    registrations: [
      { id: regId, material: MATERIAL.PLASTIC, status: 'approved' }
    ]
  })

/**
 * @param {Db} db
 * @param {number} tonnage
 * @param {string} dateOfExport
 */
const seedExporterRow = (db, tonnage, dateOfExport) =>
  db.collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME).insertOne({
    organisationId: orgId,
    registrationId: regId,
    accreditationId: null,
    rowId: 'row-1',
    wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
    processingType: PROCESSING_TYPES.EXPORTER,
    data: {
      TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: tonnage,
      DATE_OF_EXPORT: dateOfExport
    },
    classification: {
      outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
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
    accreditationId: null,
    number: 1,
    kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
    payload: { summaryLogId, creditTotal: 0 }
  })

describe(`GET ${tonnageMonitoringPath} (integration)`, () => {
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

  it('aggregates seeded tonnage via the real db and ledger repository', async ({
    server
  }) => {
    await seedOrganisation(server.db)
    await seedExporterRow(server.db, 100, '2026-01-15')
    await seedSubmittedSummaryLog(server.db)

    const response = await server.inject({
      method: 'GET',
      url: tonnageMonitoringPath,
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const payload = JSON.parse(response.payload)

    expect(payload.total).toBe(100)
    expect(payload.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      year: 2026,
      type: 'Exporter',
      months: expect.arrayContaining([{ month: 'Jan', tonnage: 100 }])
    })
  })
})
