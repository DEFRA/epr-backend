import { describe, beforeEach, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'

import { it } from '#vite/fixtures/server-with-real-db.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import {
  MATERIAL,
  TONNAGE_BAND,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import {
  createMongoLedgerRepository,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from '#waste-balances/repository/ledger-mongodb.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { wasteBalanceAvailabilityPath } from './get.js'

/** @import { TestServerWithRealDb } from '#vite/fixtures/server-with-real-db.js' */

const ORGANISATIONS_COLLECTION = 'epr-organisations'
const { validToken } = entraIdMockAuthTokens

const orgId = 100987

const ledgerId = {
  organisationNumber: toOrganisationNumber(String(orgId)),
  registrationNumber: toRegistrationNumber('REG-INTEG'),
  accreditationNumber: toAccreditationNumber('ACC-INTEG')
}

const approvedStatusHistory = [
  { status: 'approved', updatedAt: new Date('2026-01-01T00:00:00.000Z') }
]

const contact = { email: 'contact@example.com', fullName: 'A Contact' }

const storedOrganisation = {
  _id: new ObjectId('507f1f77bcf86cd799439011'),
  orgId,
  companyDetails: { name: 'Acme Reprocessing' },
  statusHistory: approvedStatusHistory,
  submittedToRegulator: 'ea',
  submitterContactDetails: contact,
  users: [],
  version: 1,
  accreditations: [
    {
      id: 'acc-integ',
      accreditationNumber: ledgerId.accreditationNumber,
      material: MATERIAL.PLASTIC,
      prnIssuance: { tonnageBand: TONNAGE_BAND.UP_TO_5000 },
      statusHistory: approvedStatusHistory,
      validFrom: '2026-01-01'
    }
  ],
  registrations: [
    {
      id: 'reg-integ',
      registrationNumber: ledgerId.registrationNumber,
      accreditationId: 'acc-integ',
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
      statusHistory: approvedStatusHistory,
      validFrom: '2026-01-01',
      material: MATERIAL.PLASTIC,
      submittedToRegulator: 'ea',
      applicationContactDetails: contact,
      submitterContactDetails: contact,
      approvedPersons: []
    }
  ]
}

describe(`GET ${wasteBalanceAvailabilityPath} (integration)`, () => {
  setupAuthContext()

  beforeEach(
    async (/** @type {{ server: TestServerWithRealDb }} */ { server }) => {
      await server.db.collection(ORGANISATIONS_COLLECTION).deleteMany({})
      await server.db
        .collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
        .deleteMany({})
    }
  )

  it('aggregates available balance by material via the real db', async ({
    server
  }) => {
    await server.db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(storedOrganisation)
    const ledgerRepository = (await createMongoLedgerRepository(server.db))()
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        ...ledgerId,
        closingBalance: { amount: 100, availableAmount: 100 }
      })
    ])

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
