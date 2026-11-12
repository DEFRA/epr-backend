import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'
import { beforeEach, describe, expect, vi } from 'vitest'

import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  buildAwaitingAuthorisationPrn,
  underAccreditation
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { COLLECTION_NAME as PRNS_COLLECTION } from '#packaging-recycling-notes/repository/mongodb.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  toStoredFields,
  toStoredOrganisation
} from '#repositories/organisations/helpers.js'
import { validateOrganisationInsert } from '#repositories/organisations/schema/index.js'
import { asOperator, asServiceMaintainerWrite } from '#test/inject-auth.js'
import { it } from '#vite/fixtures/server-with-real-db.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  WASTE_BALANCE_EVENTS_COLLECTION_NAME,
  createMongoLedgerRepository
} from '#waste-balances/repository/ledger-mongodb.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { createStatusHistoryBuilders } from './status-history-test-helpers.js'

/** @import { Db } from 'mongodb' */
/** @import { Organisation } from '#domain/organisations/model.js' */

/*
 * A status this service writes through the status-history endpoints is what
 * the PRN routes then read, through the organisation read model. Both read
 * the one MongoDB collection, so these tests run against it.
 */

const ORGANISATIONS_COLLECTION = 'epr-organisations'

const { validToken } = entraIdMockAuthTokens

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const organisationBuilders = createOrganisationBuilders()
const { buildOrgWithAccreditationStatus, buildOrgWithRegistrationStatus } =
  createStatusHistoryBuilders(organisationBuilders)

const suspendPayload = { fromStatus: 'approved', toStatus: 'suspended' }
const reinstatePayload = { fromStatus: 'suspended', toStatus: 'approved' }
const cancelPayload = { fromStatus: 'suspended', toStatus: 'cancelled' }
const reinstateAfterAppealPayload = {
  fromStatus: 'cancelled',
  toStatus: 'approved'
}
const grantRegistrationPayload = {
  fromStatus: 'created',
  toStatus: 'approved',
  validFrom: '2026-08-01',
  registrationNumber: 'REG999999'
}

/**
 * Stores the organisation as the organisations repository stores it, once the
 * repository's insert validation accepts it, so a fixture the write path would
 * reject fails here. It is written directly rather than through `insert`,
 * because `insert` starts every status history at `created`, and these tests
 * start from approved, suspended and cancelled states.
 *
 * @param {Db} db
 * @param {Organisation} organisation
 */
const storeOrganisation = async (db, organisation) => {
  validateOrganisationInsert(toStoredFields(organisation))
  const { id, ...stored } = toStoredOrganisation(organisation)
  await db
    .collection(ORGANISATIONS_COLLECTION)
    .insertOne({ _id: ObjectId.createFromHexString(id), ...stored })
}

/**
 * An approved organisation with an approved registration, which the read
 * model serves, so the PRN routes can find it by its natural keys.
 *
 * @param {string} status
 */
const buildServedOrgWithAccreditationStatus = (status) => ({
  ...buildOrgWithAccreditationStatus(status, {
    registrationStatus: 'approved',
    // The year a test PRN is raised in, so the PRN finds its accreditation.
    accreditationOverrides: { validFrom: '2026-01-01', validTo: '2027-01-01' }
  }),
  statusHistory: /** @type {Organisation['statusHistory']} */ ([
    { status: 'approved', updatedAt: new Date('2024-01-01') }
  ])
})

/**
 * The numbers of the organisation's registration and the accreditation it
 * links to, which buildOrgWithAccreditationStatus puts first.
 *
 * @param {Organisation} organisation
 */
const numbersOf = ({
  organisationNumber,
  registrations: [registration],
  accreditations: [accreditation]
}) => ({
  organisationNumber,
  registrationNumber: toRegistrationNumber(
    /** @type {string} */ (registration.registrationNumber)
  ),
  accreditationNumber: toAccreditationNumber(
    /** @type {string} */ (accreditation.accreditationNumber)
  )
})

/**
 * Stores a PRN awaiting authorisation under the organisation's accreditation.
 *
 * @param {Db} db
 * @param {Organisation} organisation
 * @returns {Promise<string>} the PRN's id
 */
const storePrnAwaitingAuthorisation = async (db, organisation) => {
  const prnId = new ObjectId()
  await db.collection(PRNS_COLLECTION).insertOne({
    _id: prnId,
    ...buildAwaitingAuthorisationPrn(
      underAccreditation(numbersOf(organisation))
    )
  })
  return prnId.toHexString()
}

/**
 * Opens the accreditation's ledger with enough balance for a PRN's tonnage.
 *
 * @param {Db} db
 * @param {Organisation} organisation
 */
const storeLedgerWithBalance = async (db, organisation) => {
  const [registration] = organisation.registrations
  const ledgerRepository = (await createMongoLedgerRepository(db))()
  await ledgerRepository.appendEvents([
    buildLedgerEvent({
      organisationId: organisation.id,
      registrationId: registration.id,
      accreditationId: /** @type {string} */ (registration.accreditationId),
      ...numbersOf(organisation),
      number: 1,
      payload: { summaryLogId: 'log-1', creditTotal: 500 },
      openingBalance: { amount: 0, availableAmount: 0 },
      closingBalance: { amount: 500, availableAmount: 500 }
    })
  ])
}

/**
 * @param {Organisation} organisation
 * @param {string} prnId
 */
const prnStatusUrl = (
  { organisationNumber, registrations: [registration] },
  prnId
) =>
  `/organisations/${organisationNumber}/registrations/${registration.registrationNumber}/accreditations/2026/packaging-recycling-notes/${prnId}/status`

/** @param {Organisation} organisation */
const accreditationStatusHistoryUrl = ({ id, registrations: [registration] }) =>
  `/v1/organisations/${id}/registrations/${registration.id}/accreditations/${registration.accreditationId}/status-history`

describe('status history written, then read by the PRN routes (integration)', () => {
  setupAuthContext()

  beforeEach(
    async (
      /** @type {{ server: import('#vite/fixtures/server-with-real-db.js').TestServerWithRealDb }} */ {
        server
      }
    ) => {
      await server.db.collection(ORGANISATIONS_COLLECTION).deleteMany({})
      await server.db.collection(PRNS_COLLECTION).deleteMany({})
      await server.db
        .collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
        .deleteMany({})
    }
  )

  describe('an accreditation status', () => {
    /**
     * Writes the accreditation status change, then asks to issue the PRN.
     *
     * @param {import('#vite/fixtures/server-with-real-db.js').TestServerWithRealDb} server
     * @param {Organisation} organisation
     * @param {string} prnId
     * @param {object} payload
     */
    const changeStatusThenIssue = async (
      server,
      organisation,
      prnId,
      payload
    ) => {
      const statusResponse = await server.inject({
        method: 'POST',
        url: accreditationStatusHistoryUrl(organisation),
        payload,
        ...asServiceMaintainerWrite()
      })
      expect(statusResponse.statusCode).toBe(StatusCodes.OK)

      return server.inject({
        method: 'POST',
        url: prnStatusUrl(organisation, prnId),
        ...asOperator(),
        payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
      })
    }

    it('refuses to issue a PRN once the accreditation has been suspended', async ({
      server
    }) => {
      const organisation = buildServedOrgWithAccreditationStatus('approved')
      await storeOrganisation(server.db, organisation)
      const prnId = await storePrnAwaitingAuthorisation(server.db, organisation)

      const issueResponse = await changeStatusThenIssue(
        server,
        organisation,
        prnId,
        suspendPayload
      )

      expect(issueResponse.statusCode).toBe(StatusCodes.FORBIDDEN)
      expect(issueResponse.payload).toContain(
        'Cannot issue a PRN on a suspended accreditation'
      )
    })

    it('permits issuing a PRN again once the accreditation has been reinstated', async ({
      server
    }) => {
      const organisation = buildServedOrgWithAccreditationStatus('suspended')
      await storeOrganisation(server.db, organisation)
      const prnId = await storePrnAwaitingAuthorisation(server.db, organisation)
      await storeLedgerWithBalance(server.db, organisation)

      const issueResponse = await changeStatusThenIssue(
        server,
        organisation,
        prnId,
        reinstatePayload
      )

      expect(issueResponse.statusCode).toBe(StatusCodes.OK)
    })

    it('refuses to issue a PRN once the accreditation has been cancelled', async ({
      server
    }) => {
      const organisation = buildServedOrgWithAccreditationStatus('suspended')
      await storeOrganisation(server.db, organisation)
      const prnId = await storePrnAwaitingAuthorisation(server.db, organisation)

      const issueResponse = await changeStatusThenIssue(
        server,
        organisation,
        prnId,
        cancelPayload
      )

      expect(issueResponse.statusCode).toBe(StatusCodes.FORBIDDEN)
      expect(issueResponse.payload).toContain(
        'Cannot issue a PRN on a cancelled accreditation'
      )
    })

    it('permits issuing a PRN again once the accreditation has been reinstated after an appeal', async ({
      server
    }) => {
      const organisation = buildServedOrgWithAccreditationStatus('cancelled')
      await storeOrganisation(server.db, organisation)
      const prnId = await storePrnAwaitingAuthorisation(server.db, organisation)
      await storeLedgerWithBalance(server.db, organisation)

      const issueResponse = await changeStatusThenIssue(
        server,
        organisation,
        prnId,
        reinstateAfterAppealPayload
      )

      expect(issueResponse.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('a registration granted', () => {
    it('cannot have a PRN created under it, as granting a registration grants no accreditation', async ({
      server
    }) => {
      // An approved organisation, so the PRN route finds it and the granted
      // registration by their natural keys. The target (reprocessor)
      // registration comes first.
      const organisation = {
        ...buildOrgWithRegistrationStatus('created'),
        statusHistory: /** @type {Organisation['statusHistory']} */ ([
          { status: 'approved', updatedAt: new Date('2024-01-01') }
        ])
      }
      const [registration] = organisation.registrations
      await storeOrganisation(server.db, organisation)

      const grantResponse = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisation.id}/registrations/${registration.id}/status-history`,
        payload: grantRegistrationPayload,
        ...asServiceMaintainerWrite()
      })
      expect(grantResponse.statusCode).toBe(StatusCodes.OK)

      // Confirm the grant left the organisation with no accreditation before
      // treating the PRN 404 below as evidence of registered-only, rather than
      // of some unrelated setup gap.
      const getResponse = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisation.id}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })
      const updated = JSON.parse(getResponse.payload)
      expect(updated.accreditations).toEqual([])
      const granted = updated.registrations.find(
        (/** @type {{ id: string }} */ { id }) => id === registration.id
      )
      expect(granted.status).toBe('approved')
      expect(granted.accreditationId).toBeUndefined()

      const createResponse = await server.inject({
        method: 'POST',
        url: `/organisations/${organisation.organisationNumber}/registrations/${grantRegistrationPayload.registrationNumber}/accreditations/2026/packaging-recycling-notes`,
        ...asOperator(),
        payload: {
          issuedToOrganisation: { id: 'org-2', name: 'Recipient Org' },
          tonnage: 10
        }
      })

      expect(createResponse.statusCode).toBe(StatusCodes.NOT_FOUND)
      expect(JSON.parse(createResponse.payload).message).toBe(
        'Accreditation not found'
      )
    })
  })
})
