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
import { MATERIAL, TONNAGE_BAND } from '#domain/organisations/model.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  EXPORTER_ACCREDITATION_NUMBER,
  EXPORTER_NUMBER,
  exporter,
  exporterAccreditation
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import {
  buildAwaitingAcceptancePrn,
  buildAccreditationSnapshot
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { REGISTRATION_TYPE } from '#application/prn-tonnage/aggregate-prn-tonnage.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { prnTonnagePath } from './get.js'

/** @import { TestServerWithRealDb } from '#vite/fixtures/server-with-real-db.js' */

const PRNS_COLLECTION = 'packaging-recycling-notes'
const ORGANISATIONS_COLLECTION = 'epr-organisations'
const { validToken } = entraIdMockAuthTokens

const organisationId = '507f1f77bcf86cd799439011'
const orgId = 100987
const accId = 'acc-integ'
const registrationId = 'reg-integ'

const ledgerId = {
  organisationId,
  registrationId,
  accreditationId: accId
}

const { buildOrganisation } = createOrganisationBuilders()

const storedOrganisation = () => {
  const { id, ...rest } = buildOrganisation({
    id: organisationId,
    orgId,
    companyDetails: { name: 'Acme Reprocessing' },
    registrations: [
      exporter({
        id: registrationId,
        material: MATERIAL.PLASTIC,
        accreditationId: accId,
        registrationNumber: EXPORTER_NUMBER,
        overseasSites: {}
      })
    ],
    accreditations: [
      exporterAccreditation({
        id: accId,
        material: MATERIAL.PLASTIC,
        accreditationNumber: toAccreditationNumber(
          EXPORTER_ACCREDITATION_NUMBER
        ),
        prnIssuance: { tonnageBand: TONNAGE_BAND.UP_TO_5000 }
      })
    ]
  })
  return { _id: new ObjectId(id), ...rest }
}

const awaitingAcceptancePrn = () =>
  buildAwaitingAcceptancePrn({
    registrationId,
    organisation: {
      id: organisationId,
      name: 'Acme Reprocessing',
      organisationNumber: toOrganisationNumber(String(orgId))
    },
    registration: { registrationNumber: toRegistrationNumber(EXPORTER_NUMBER) },
    accreditation: buildAccreditationSnapshot({
      id: accId,
      accreditationNumber: EXPORTER_ACCREDITATION_NUMBER,
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
      .insertOne(storedOrganisation())
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
        registrationNumber: EXPORTER_NUMBER,
        registrationType: REGISTRATION_TYPE.EXPORTER,
        accreditationNumber: EXPORTER_ACCREDITATION_NUMBER,
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
})
