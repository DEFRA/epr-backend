import { describe, beforeEach, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'

import { it } from '#vite/fixtures/server-with-real-db.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { MATERIAL } from '#domain/organisations/model.js'
import { WASTE_BALANCE_EVENTS_COLLECTION_NAME } from '#waste-balances/repository/ledger-mongodb.js'
import { wasteBalanceAvailabilityPath } from './get.js'

/** @import { Db } from 'mongodb' */
/** @import { RealDbTestServer } from '#vite/fixtures/server-with-real-db.js' */

const ORGANISATIONS_COLLECTION = 'epr-organisations'
const { validToken } = entraIdMockAuthTokens

const orgId = '507f1f77bcf86cd799439011'
const regId = 'REG-001'
const accId = 'ACC-001'

/** @param {Db} db */
const seedAccreditedRegistration = (db) =>
  db.collection(ORGANISATIONS_COLLECTION).insertOne({
    _id: new ObjectId(orgId),
    registrations: [
      {
        id: regId,
        material: MATERIAL.PLASTIC,
        status: 'approved',
        accreditationId: accId
      }
    ]
  })

/**
 * @param {Db} db
 * @param {number} availableAmount
 */
const seedLedgerClosingBalance = (db, availableAmount) =>
  db.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME).insertOne({
    registrationId: regId,
    accreditationId: accId,
    number: 1,
    closingBalance: { amount: availableAmount, availableAmount }
  })

describe(`GET ${wasteBalanceAvailabilityPath} (integration)`, () => {
  setupAuthContext()

  beforeEach(async (/** @type {{ server: RealDbTestServer }} */ { server }) => {
    await server.db.collection(ORGANISATIONS_COLLECTION).deleteMany({})
    await server.db
      .collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
      .deleteMany({})
  })

  it('aggregates available balance by material via the real db', async ({
    server
  }) => {
    await seedAccreditedRegistration(server.db)
    await seedLedgerClosingBalance(server.db, 100)

    const response = await server.inject({
      method: 'GET',
      url: wasteBalanceAvailabilityPath,
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const payload = JSON.parse(response.payload)

    expect(payload.total).toBe(100)
    expect(payload.materials).toContainEqual({
      material: MATERIAL.PLASTIC,
      availableAmount: 100
    })
  })
})
