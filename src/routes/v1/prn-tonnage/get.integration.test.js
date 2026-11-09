import { describe, beforeEach, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'

import { it } from '#vite/fixtures/server-with-real-db.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  MATERIAL,
  TONNAGE_BAND,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  buildAwaitingAcceptancePrn,
  buildAccreditationSnapshot
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { REGISTRATION_TYPE } from '#application/prn-tonnage/aggregate-prn-tonnage.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { prnTonnagePath } from './get.js'

/** @import { TestServerWithRealDb } from '#vite/fixtures/server-with-real-db.js' */

const PRNS_COLLECTION = 'packaging-recycling-notes'
const ORGANISATIONS_COLLECTION = 'epr-organisations'
const { validToken } = entraIdMockAuthTokens

const organisationId = '507f1f77bcf86cd799439011'
const orgId = 100987
const accId = 'acc-integ'
const registrationId = 'reg-integ'

const approvedStatusHistory = [
  { status: 'approved', updatedAt: new Date('2026-01-01T00:00:00.000Z') }
]

const ledgerId = {
  organisationId,
  registrationId,
  accreditationId: accId,
  organisationNumber: toOrganisationNumber(String(orgId)),
  registrationNumber: toRegistrationNumber('REG-INTEG'),
  accreditationNumber: toAccreditationNumber('ACC-INTEG')
}

/** @param {string | null} accreditationNumber */
const storedOrganisation = (accreditationNumber) => ({
  _id: new ObjectId(organisationId),
  orgId,
  companyDetails: { name: 'Acme Reprocessing' },
  statusHistory: approvedStatusHistory,
  accreditations: [
    {
      id: accId,
      accreditationNumber,
      material: MATERIAL.PLASTIC,
      prnIssuance: { tonnageBand: TONNAGE_BAND.UP_TO_5000 },
      statusHistory: approvedStatusHistory
    }
  ],
  registrations: [
    {
      id: registrationId,
      registrationNumber: 'REG-INTEG',
      accreditationId: accId,
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
      statusHistory: approvedStatusHistory
    }
  ]
})

const awaitingAcceptancePrn = () =>
  buildAwaitingAcceptancePrn({
    registrationId,
    organisation: { id: organisationId, name: 'Acme Reprocessing' },
    accreditation: buildAccreditationSnapshot({
      id: accId,
      accreditationNumber: toAccreditationNumber('ACC-INTEG'),
      material: MATERIAL.PLASTIC
    }),
    tonnage: 100
  })

describe(`GET ${prnTonnagePath} (integration)`, () => {
  setupAuthContext()

  beforeEach(
    async (/** @type {{ server: TestServerWithRealDb }} */ { server }) => {
      await server.db.collection(PRNS_COLLECTION).deleteMany({})
      await server.db.collection(ORGANISATIONS_COLLECTION).deleteMany({})
      const ledgerRepository = (await createMongoLedgerRepository(server.db))()
      await ledgerRepository.deleteAllInLedger(ledgerId)
    }
  )

  it('aggregates PRN tonnage by status via the real db', async ({ server }) => {
    await server.db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(storedOrganisation('ACC-INTEG'))
    await server.db
      .collection(PRNS_COLLECTION)
      .insertOne(awaitingAcceptancePrn())
    const ledgerRepository = (await createMongoLedgerRepository(server.db))()
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        ...ledgerId,
        closingBalance: { amount: 750, availableAmount: 600 }
      })
    ])

    const response = await server.inject({
      method: 'GET',
      url: prnTonnagePath,
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload).rows).toStrictEqual([
      {
        organisationName: 'Acme Reprocessing',
        orgId: String(orgId),
        registrationNumber: 'REG-INTEG',
        registrationType: REGISTRATION_TYPE.EXPORTER,
        accreditationNumber: 'ACC-INTEG',
        material: MATERIAL.PLASTIC,
        tonnageBand: TONNAGE_BAND.UP_TO_5000,
        wasteBalance: 750,
        availableWasteBalance: 600,
        awaitingAuthorisationTonnage: 0,
        awaitingAcceptanceTonnage: 100,
        awaitingCancellationTonnage: 0,
        acceptedTonnage: 0,
        cancelledTonnage: 0
      }
    ])
    expect(server.loggerMocks.info).toHaveBeenCalledWith({
      message: 'PRN tonnage data retrieved successfully',
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
      }
    })
  })

  it('serves a blank accreditation number for an accreditation that no longer has one', async ({
    server
  }) => {
    await server.db
      .collection(ORGANISATIONS_COLLECTION)
      .insertOne(storedOrganisation(null))
    await server.db
      .collection(PRNS_COLLECTION)
      .insertOne(awaitingAcceptancePrn())

    const response = await server.inject({
      method: 'GET',
      url: prnTonnagePath,
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload).rows).toMatchObject([
      { accreditationNumber: '' }
    ])
  })
})
