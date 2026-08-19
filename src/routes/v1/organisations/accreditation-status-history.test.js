import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { buildAwaitingAuthorisationPrn } from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { asOperator, asServiceMaintainerWrite } from '#test/inject-auth.js'
import { createTestServer } from '#test/create-test-server.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { partialMock } from '#test/type-helpers.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'

const { validToken } = entraIdMockAuthTokens

const mockCdpAuditing = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockCdpAuditing(...args)
}))

/**
 * Builds an organisation with a registration linked to a target
 * accreditation whose statusHistory ends in the given status, plus an
 * unrelated second (unlinked, 'created') accreditation used to assert that
 * changing the target's status leaves other accreditations untouched.
 * The linked registration is 'created' by default; approving the
 * accreditation requires an approved registration, so tests opt in via
 * registrationStatus ('approved', 'rejected' or 'cancelled').
 * accreditationOverrides lets grant tests shape the target accreditation
 * (e.g. no number yet).
 * @param {string} status
 * @param {{ registrationStatus?: string, accreditationOverrides?: object }} [options]
 */
const buildOrgWithAccreditationStatus = (
  status,
  { registrationStatus = 'created', accreditationOverrides = {} } = {}
) => {
  const accreditationId = new ObjectId().toString()
  const registration = buildRegistration({
    accreditationId,
    reprocessingType: 'input',
    ...(registrationStatus !== 'created' && {
      // registrationNumber/validFrom/validTo are only required once a
      // registration has been approved, but non-created registrations get
      // them for realism (mirrors buildOrgWithRegistrationStatus).
      registrationNumber: 'REG123456',
      validFrom: '2024-01-01',
      validTo: '2025-01-01',
      statusHistory: [
        { status: 'created', updatedAt: '2024-01-01' },
        { status: registrationStatus, updatedAt: '2024-01-15' }
      ]
    })
  })
  const accreditation = buildAccreditation({
    id: accreditationId,
    wasteProcessingType: registration.wasteProcessingType,
    // validFrom/validTo/accreditationNumber/reprocessingType are only
    // required once an accreditation has been approved or suspended.
    validFrom: '2024-01-01',
    validTo: '2025-01-01',
    accreditationNumber: 'ACC123456',
    reprocessingType: 'input',
    statusHistory:
      /** @type {import('#domain/organisations/accreditation.js').StatusHistoryEntry[]} */ (
        status === 'created'
          ? [{ status: 'created', updatedAt: '2024-01-01' }]
          : [
              { status: 'created', updatedAt: '2024-01-01' },
              { status, updatedAt: '2024-02-01' }
            ]
      ),
    ...accreditationOverrides
  })
  const otherAccreditation = buildAccreditation()

  return /** @type {import('#domain/organisations/model.js').Organisation} */ (
    /** @type {unknown} */ (
      buildOrganisation({
        registrations: [registration],
        accreditations: [accreditation, otherAccreditation]
      })
    )
  )
}

const statusHistoryUrl = ({
  organisationId,
  registrationId,
  accreditationId
}) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/status-history`

const suspendPayload = { fromStatus: 'approved', toStatus: 'suspended' }
const reinstatePayload = { fromStatus: 'suspended', toStatus: 'approved' }
const cancelPayload = { fromStatus: 'suspended', toStatus: 'cancelled' }
const reinstateAfterAppealPayload = {
  fromStatus: 'cancelled',
  toStatus: 'approved'
}
// validTo deliberately differs from the seeded fixture value so the grant
// assertions prove the persisted window came from the request, not the
// application data that was already there.
const grantPayload = {
  fromStatus: 'created',
  toStatus: 'approved',
  validFrom: '2026-08-01',
  validTo: '2027-03-31',
  accreditationNumber: 'ACC999999'
}
const rejectPayload = { fromStatus: 'created', toStatus: 'rejected' }
const reopenPayload = { fromStatus: 'rejected', toStatus: 'created' }

describe('POST /v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/status-history', () => {
  setupAuthContext()
  let server

  const seedOrg = async (status, options = {}) => {
    const { extraOrgs = [], ...builderOptions } = options
    const fixture = buildOrgWithAccreditationStatus(status, builderOptions)
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([fixture, ...extraOrgs])

    server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        systemLogsRepository: createSystemLogsRepository()
      }
    })

    const getResponse = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${fixture.id}`,
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(getResponse.statusCode).toBe(StatusCodes.OK)
    const org = JSON.parse(getResponse.payload)
    const registration = org.registrations[0]
    const otherAccreditationId = org.accreditations.find(
      (a) => a.id !== registration.accreditationId
    ).id

    return {
      org,
      organisationId: org.id,
      registrationId: registration.id,
      accreditationId: registration.accreditationId,
      otherAccreditationId
    }
  }

  afterAll(() => {
    vi.resetAllMocks()
  })

  describe('happy path', () => {
    it('suspends an approved accreditation and returns 200 with { status: "suspended" }', async () => {
      const ctx = await seedOrg('approved')

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: suspendPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({ status: 'suspended' })
    })

    it('appends a statusHistory entry without updatedBy, preserving earlier entries', async () => {
      const ctx = await seedOrg('approved')

      await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: suspendPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const getResponse = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${ctx.organisationId}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const updatedOrg = JSON.parse(getResponse.payload)
      const accreditation = updatedOrg.accreditations.find(
        (a) => a.id === ctx.accreditationId
      )

      expect(accreditation.status).toBe('suspended')
      expect(accreditation.statusHistory).toHaveLength(3)
      expect(accreditation.statusHistory[0]).toMatchObject({
        status: 'created'
      })
      expect(accreditation.statusHistory[1]).toMatchObject({
        status: 'approved'
      })
      const lastEntry = accreditation.statusHistory.at(-1)
      expect(lastEntry.status).toBe('suspended')
      expect(lastEntry.updatedBy).toBeUndefined()

      const otherAccreditation = updatedOrg.accreditations.find(
        (a) => a.id === ctx.otherAccreditationId
      )
      expect(otherAccreditation.status).toBe('created')
    })

    it('does not modify validFrom, validTo or accreditationNumber', async () => {
      const ctx = await seedOrg('approved')
      const before = ctx.org.accreditations.find(
        (a) => a.id === ctx.accreditationId
      )

      await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: suspendPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const getResponse = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${ctx.organisationId}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })
      const updatedOrg = JSON.parse(getResponse.payload)
      const after = updatedOrg.accreditations.find(
        (a) => a.id === ctx.accreditationId
      )

      expect(after.validFrom).toBe(before.validFrom)
      expect(after.validTo).toBe(before.validTo)
      expect(after.accreditationNumber).toBe(before.accreditationNumber)
    })

    it('captures a system log entry with actor and before/after status', async () => {
      const ctx = await seedOrg('approved')
      const start = new Date()

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: suspendPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })
      expect(response.statusCode).toBe(StatusCodes.OK)

      const systemLogsResponse = await server.inject({
        method: 'GET',
        url: `/v1/system-logs/search?organisationId=${ctx.organisationId}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(systemLogsResponse.statusCode).toBe(StatusCodes.OK)
      const { systemLogs } = JSON.parse(systemLogsResponse.payload)
      expect(systemLogs).toHaveLength(1)

      const [entry] = systemLogs
      expect(entry.createdBy).toMatchObject({
        id: 'test-user-id',
        email: 'me@example.com'
      })
      expect(new Date(entry.createdAt).getTime()).toBeGreaterThanOrEqual(
        start.getTime()
      )
      expect(entry.event).toMatchObject({
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'update'
      })

      const previousAccreditation = entry.context.previous.accreditations.find(
        (a) => a.id === ctx.accreditationId
      )
      const nextAccreditation = entry.context.next.accreditations.find(
        (a) => a.id === ctx.accreditationId
      )
      expect(previousAccreditation.status).toBe('approved')
      expect(nextAccreditation.status).toBe('suspended')

      expect(mockCdpAuditing).toHaveBeenCalledTimes(1)
    })
  })

  describe('fromStatus mismatch', () => {
    it.each(['created', 'suspended', 'rejected', 'cancelled'])(
      'returns 422 when suspending an accreditation that is currently %s',
      async (status) => {
        const ctx = await seedOrg(status)

        const response = await server.inject({
          method: 'POST',
          url: statusHistoryUrl(ctx),
          payload: suspendPayload,
          headers: { Authorization: `Bearer ${validToken}` }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
        const body = JSON.parse(response.payload)
        expect(body.message).toMatch(
          new RegExp(
            `Cannot transition accreditation from approved: its status is ${status}`
          )
        )
      }
    )
  })

  describe('reinstating a suspended accreditation', () => {
    it('reinstates a suspended accreditation and returns 200 with { status: "approved" }', async () => {
      const ctx = await seedOrg('suspended', { registrationStatus: 'approved' })

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: reinstatePayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({ status: 'approved' })
    })

    it('appends an approved statusHistory entry, preserving the suspension gap', async () => {
      const ctx = await seedOrg('suspended', { registrationStatus: 'approved' })

      await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: reinstatePayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const getResponse = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${ctx.organisationId}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const updatedOrg = JSON.parse(getResponse.payload)
      const accreditation = updatedOrg.accreditations.find(
        (a) => a.id === ctx.accreditationId
      )

      expect(accreditation.status).toBe('approved')
      expect(accreditation.statusHistory.map((e) => e.status)).toEqual([
        'created',
        'suspended',
        'approved'
      ])
    })

    it('returns 422 when the linked registration is not approved', async () => {
      const ctx = await seedOrg('suspended')

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: reinstatePayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe(
        'Cannot transition accreditation to approved: its registration is created'
      )
    })

    it.each(['approved', 'rejected', 'created'])(
      'returns 422 when the accreditation is currently %s',
      async (status) => {
        const ctx = await seedOrg(status, { registrationStatus: 'approved' })

        const response = await server.inject({
          method: 'POST',
          url: statusHistoryUrl(ctx),
          payload: reinstatePayload,
          headers: { Authorization: `Bearer ${validToken}` }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
        const body = JSON.parse(response.payload)
        expect(body.message).toMatch(
          new RegExp(
            `Cannot transition accreditation from suspended: its status is ${status}`
          )
        )
      }
    )
  })

  describe('cancelling a suspended accreditation', () => {
    it('cancels a suspended accreditation and returns 200 with { status: "cancelled" }', async () => {
      const ctx = await seedOrg('suspended')

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: cancelPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({ status: 'cancelled' })
    })

    it('appends a cancelled statusHistory entry, preserving earlier entries', async () => {
      const ctx = await seedOrg('suspended')

      await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: cancelPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const getResponse = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${ctx.organisationId}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const updatedOrg = JSON.parse(getResponse.payload)
      const accreditation = updatedOrg.accreditations.find(
        (a) => a.id === ctx.accreditationId
      )

      expect(accreditation.status).toBe('cancelled')
      expect(accreditation.statusHistory.map((e) => e.status)).toEqual([
        'created',
        'suspended',
        'cancelled'
      ])
    })

    it.each(['approved', 'created', 'rejected', 'cancelled'])(
      'returns 422 when cancelling an accreditation that is currently %s',
      async (status) => {
        const ctx = await seedOrg(status)

        const response = await server.inject({
          method: 'POST',
          url: statusHistoryUrl(ctx),
          payload: cancelPayload,
          headers: { Authorization: `Bearer ${validToken}` }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
        const body = JSON.parse(response.payload)
        expect(body.message).toMatch(
          new RegExp(
            `Cannot transition accreditation from suspended: its status is ${status}`
          )
        )
      }
    )
  })

  describe('reinstating a cancelled accreditation after a successful appeal', () => {
    it('reinstates a cancelled accreditation and returns 200 with { status: "approved" }', async () => {
      const ctx = await seedOrg('cancelled', { registrationStatus: 'approved' })

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: reinstateAfterAppealPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({ status: 'approved' })
    })

    it('appends an approved statusHistory entry, preserving the cancelled gap', async () => {
      const ctx = await seedOrg('cancelled', { registrationStatus: 'approved' })

      await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: reinstateAfterAppealPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const getResponse = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${ctx.organisationId}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const updatedOrg = JSON.parse(getResponse.payload)
      const accreditation = updatedOrg.accreditations.find(
        (a) => a.id === ctx.accreditationId
      )

      expect(accreditation.status).toBe('approved')
      expect(accreditation.statusHistory.map((e) => e.status)).toEqual([
        'created',
        'cancelled',
        'approved'
      ])
    })

    it('returns 422 when the linked registration is not approved', async () => {
      const ctx = await seedOrg('cancelled')

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: reinstateAfterAppealPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe(
        'Cannot transition accreditation to approved: its registration is created'
      )
    })

    it.each(['approved', 'created', 'rejected', 'suspended'])(
      'returns 422 when the accreditation is currently %s',
      async (status) => {
        const ctx = await seedOrg(status, { registrationStatus: 'approved' })

        const response = await server.inject({
          method: 'POST',
          url: statusHistoryUrl(ctx),
          payload: reinstateAfterAppealPayload,
          headers: { Authorization: `Bearer ${validToken}` }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
        const body = JSON.parse(response.payload)
        expect(body.message).toMatch(
          new RegExp(
            `Cannot transition accreditation from cancelled: its status is ${status}`
          )
        )
      }
    )
  })

  describe('granting a created accreditation', () => {
    // A created accreditation has no number or validFrom yet. validTo
    // defaults to already being present, mirroring the application data, so
    // that grant tests can prove the granted window overwrites it.
    const ungrantedAccreditation = {
      accreditationNumber: null,
      validFrom: null,
      validTo: '2026-12-31'
    }

    const buildOrgHoldingNumber = (accreditationNumber) =>
      /** @type {import('#domain/organisations/model.js').Organisation} */ (
        /** @type {unknown} */ (
          buildOrganisation({
            accreditations: [buildAccreditation({ accreditationNumber })]
          })
        )
      )

    it('grants the accreditation, issuing the number and setting the validity window from the payload', async () => {
      const ctx = await seedOrg('created', {
        registrationStatus: 'approved',
        accreditationOverrides: ungrantedAccreditation
      })

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: grantPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({ status: 'approved' })

      const getResponse = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${ctx.organisationId}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })
      const updatedOrg = JSON.parse(getResponse.payload)
      const accreditation = updatedOrg.accreditations.find(
        (a) => a.id === ctx.accreditationId
      )

      expect(accreditation.status).toBe('approved')
      expect(accreditation.accreditationNumber).toBe('ACC999999')
      expect(accreditation.validFrom).toBe('2026-08-01')
      // Overwrites the seeded 2026-12-31, proving the window came from the
      // request rather than the pre-existing application data.
      expect(accreditation.validTo).toBe('2027-03-31')
      expect(accreditation.statusHistory.map((e) => e.status)).toEqual([
        'created',
        'approved'
      ])
    })

    it('returns 422 when the accreditation number is already in use by another organisation', async () => {
      const ctx = await seedOrg('created', {
        registrationStatus: 'approved',
        accreditationOverrides: ungrantedAccreditation,
        extraOrgs: [buildOrgHoldingNumber('ACC555555')]
      })

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: { ...grantPayload, accreditationNumber: 'ACC555555' },
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Accreditation number ACC555555 is already in use/
      )
    })

    it('returns 422 when the supplied validFrom is after the supplied validTo', async () => {
      const ctx = await seedOrg('created', {
        registrationStatus: 'approved',
        accreditationOverrides: ungrantedAccreditation
      })

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: { ...grantPayload, validFrom: '2027-06-01' },
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /validFrom 2027-06-01 is after validTo 2027-03-31/
      )
    })

    it('compares the supplied dates even when the accreditation has no stored validTo', async () => {
      const ctx = await seedOrg('created', {
        registrationStatus: 'approved',
        accreditationOverrides: { ...ungrantedAccreditation, validTo: null }
      })

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: { ...grantPayload, validFrom: '2027-06-01' },
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /validFrom 2027-06-01 is after validTo 2027-03-31/
      )
    })

    it('grants an accreditation that has no stored validTo, setting it from the payload', async () => {
      const ctx = await seedOrg('created', {
        registrationStatus: 'approved',
        accreditationOverrides: { ...ungrantedAccreditation, validTo: null }
      })

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: grantPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const getResponse = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${ctx.organisationId}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })
      const accreditation = JSON.parse(getResponse.payload).accreditations.find(
        (a) => a.id === ctx.accreditationId
      )

      expect(accreditation.status).toBe('approved')
      expect(accreditation.validFrom).toBe('2026-08-01')
      expect(accreditation.validTo).toBe('2027-03-31')
    })

    it('returns 422 when the linked registration is not approved', async () => {
      const ctx = await seedOrg('created', {
        accreditationOverrides: ungrantedAccreditation
      })

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: grantPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe(
        'Cannot transition accreditation to approved: its registration is created'
      )
    })

    it('returns 422 when the accreditation is not currently created', async () => {
      const ctx = await seedOrg('suspended', { registrationStatus: 'approved' })

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: grantPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Cannot transition accreditation from created: its status is suspended/
      )
    })
  })

  describe('rejecting a created accreditation', () => {
    it('rejects a created accreditation and returns 200 with { status: "rejected" }', async () => {
      const ctx = await seedOrg('created')

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: rejectPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({ status: 'rejected' })
    })

    it('appends a rejected statusHistory entry, preserving earlier entries', async () => {
      const ctx = await seedOrg('created')

      await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: rejectPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const getResponse = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${ctx.organisationId}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const updatedOrg = JSON.parse(getResponse.payload)
      const accreditation = updatedOrg.accreditations.find(
        (a) => a.id === ctx.accreditationId
      )

      expect(accreditation.status).toBe('rejected')
      expect(accreditation.statusHistory.map((e) => e.status)).toEqual([
        'created',
        'rejected'
      ])

      const otherAccreditation = updatedOrg.accreditations.find(
        (a) => a.id === ctx.otherAccreditationId
      )
      expect(otherAccreditation.status).toBe('created')
    })

    it.each(['approved', 'suspended', 'rejected', 'cancelled'])(
      'returns 422 when rejecting an accreditation that is currently %s',
      async (status) => {
        const ctx = await seedOrg(status)

        const response = await server.inject({
          method: 'POST',
          url: statusHistoryUrl(ctx),
          payload: rejectPayload,
          headers: { Authorization: `Bearer ${validToken}` }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
        const body = JSON.parse(response.payload)
        expect(body.message).toMatch(
          new RegExp(
            `Cannot transition accreditation from created: its status is ${status}`
          )
        )
      }
    )
  })

  describe('reopening a rejected accreditation', () => {
    it('reopens a rejected accreditation and returns 200 with { status: "created" }', async () => {
      const ctx = await seedOrg('rejected')

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: reopenPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({ status: 'created' })
    })

    it('appends a created statusHistory entry, preserving the rejection gap', async () => {
      const ctx = await seedOrg('rejected')

      await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: reopenPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const getResponse = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${ctx.organisationId}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const updatedOrg = JSON.parse(getResponse.payload)
      const accreditation = updatedOrg.accreditations.find(
        (a) => a.id === ctx.accreditationId
      )

      expect(accreditation.status).toBe('created')
      expect(accreditation.statusHistory.map((e) => e.status)).toEqual([
        'created',
        'rejected',
        'created'
      ])
    })

    it.each(['approved', 'suspended', 'created', 'cancelled'])(
      'returns 422 when reopening an accreditation that is currently %s',
      async (status) => {
        const ctx = await seedOrg(status)

        const response = await server.inject({
          method: 'POST',
          url: statusHistoryUrl(ctx),
          payload: reopenPayload,
          headers: { Authorization: `Bearer ${validToken}` }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
        const body = JSON.parse(response.payload)
        expect(body.message).toMatch(
          new RegExp(
            `Cannot transition accreditation from rejected: its status is ${status}`
          )
        )
      }
    )
  })

  describe('to-approved transitions require an approved registration (PAE-1800)', () => {
    const reinstatePayloadArm = {
      fromStatus: 'cancelled',
      toStatus: 'approved'
    }

    describe.each([
      { arm: 'grant', accStatus: 'created', payload: grantPayload },
      { arm: 'reinstate', accStatus: 'cancelled', payload: reinstatePayloadArm }
    ])('$arm', ({ accStatus, payload }) => {
      it.each(['created', 'rejected', 'cancelled'])(
        'returns 422 when the linked registration is %s',
        async (registrationStatus) => {
          const ctx = await seedOrg(accStatus, { registrationStatus })

          const response = await server.inject({
            method: 'POST',
            url: statusHistoryUrl(ctx),
            payload,
            headers: { Authorization: `Bearer ${validToken}` }
          })

          expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
          expect(JSON.parse(response.payload).message).toBe(
            `Cannot transition accreditation to approved: its registration is ${registrationStatus}`
          )
        }
      )
    })
  })

  describe('payload validation', () => {
    it.each([
      ['payload is missing', undefined],
      ['payload is empty', {}],
      ['payload uses the old status-only shape', { status: 'suspended' }],
      [
        // Direct approved -> cancelled is deliberately unsupported: an
        // accreditation reaches cancelled only via suspended (PAE-1624, ADR
        // 0042). The registration-cancellation cascade is the sole exception.
        'the from/to pair is a direct approved to cancelled (suspend first)',
        { fromStatus: 'approved', toStatus: 'cancelled' }
      ],
      [
        'the from/to pair is not a supported transition',
        { fromStatus: 'cancelled', toStatus: 'suspended' }
      ],
      [
        'toStatus is not a known status',
        { fromStatus: 'approved', toStatus: 'nonsense' }
      ],
      ['payload has unexpected fields', { ...suspendPayload, reason: 'x' }],
      [
        'a non-grant transition carries grant fields',
        {
          ...reinstatePayload,
          validFrom: '2026-08-01',
          accreditationNumber: 'ACC999999'
        }
      ],
      [
        'a grant is missing validFrom',
        { ...grantPayload, validFrom: undefined }
      ],
      ['a grant is missing validTo', { ...grantPayload, validTo: undefined }],
      [
        'a grant is missing the accreditation number',
        { ...grantPayload, accreditationNumber: undefined }
      ],
      [
        'a grant has an invalid validFrom date',
        { ...grantPayload, validFrom: '2026-13-45' }
      ],
      [
        'a grant has a validFrom day that does not exist in that month',
        { ...grantPayload, validFrom: '2026-02-30' }
      ],
      [
        'a grant has an invalid validTo date',
        { ...grantPayload, validTo: '2027-13-45' }
      ],
      [
        'a grant has a validTo day that does not exist in that month',
        { ...grantPayload, validTo: '2027-02-30' }
      ],
      [
        'a grant uses the legacy appliesFrom field name',
        {
          fromStatus: 'created',
          toStatus: 'approved',
          appliesFrom: '2026-08-01',
          validTo: '2027-03-31',
          accreditationNumber: 'ACC999999'
        }
      ],
      [
        'a grant has an empty accreditation number',
        { ...grantPayload, accreditationNumber: ' ' }
      ]
    ])('returns 422 when %s', async (_label, payload) => {
      const ctx = await seedOrg('approved')

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      // The server-level failAction maps Joi validation errors to 422
      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('not found cases', () => {
    it('returns 404 when the organisation does not exist', async () => {
      const ctx = await seedOrg('approved')
      const nonExistentOrgId = new ObjectId().toString()

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl({ ...ctx, organisationId: nonExistentOrgId }),
        payload: suspendPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 when the accreditation does not exist on the organisation', async () => {
      const ctx = await seedOrg('approved')
      const nonExistentAccreditationId = new ObjectId().toString()

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl({
          ...ctx,
          accreditationId: nonExistentAccreditationId
        }),
        payload: suspendPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 when the registration does not exist on the organisation', async () => {
      const ctx = await seedOrg('approved')
      const nonExistentRegistrationId = new ObjectId().toString()

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl({
          ...ctx,
          registrationId: nonExistentRegistrationId
        }),
        payload: suspendPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 when the accreditation is not linked to the registration', async () => {
      const ctx = await seedOrg('approved')

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl({
          ...ctx,
          accreditationId: ctx.otherAccreditationId
        }),
        payload: suspendPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('downstream effect: PRN issuance', () => {
    it('refuses to issue a PRN once the accreditation has been suspended through this endpoint', async () => {
      const fixture = buildOrgWithAccreditationStatus('approved')
      const registration = fixture.registrations[0]
      const accreditationId = /** @type {string} */ (
        registration.accreditationId
      )
      const prnId = new ObjectId().toHexString()

      const packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository([
          /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} */ (
            /** @type {unknown} */ (
              buildAwaitingAuthorisationPrn({
                id: prnId,
                organisation: { id: fixture.id, name: 'Test Organisation' },
                registrationId: registration.id,
                accreditation:
                  /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote['accreditation']} */ ({
                    id: accreditationId
                  })
              })
            )
          )
        ])({
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
          trace: vi.fn(),
          fatal: vi.fn(),
          child: vi.fn()
        })

      const integrationServer = await createTestServer({
        repositories: {
          organisationsRepository: createInMemoryOrganisationsRepository([
            fixture
          ]),
          systemLogsRepository: createSystemLogsRepository(),
          packagingRecyclingNotesRepository: () =>
            packagingRecyclingNotesRepository
        }
      })

      const suspendResponse = await integrationServer.inject({
        method: 'POST',
        url: statusHistoryUrl({
          organisationId: fixture.id,
          registrationId: registration.id,
          accreditationId
        }),
        payload: suspendPayload,
        ...asServiceMaintainerWrite()
      })
      expect(suspendResponse.statusCode).toBe(StatusCodes.OK)

      const issueResponse = await integrationServer.inject({
        method: 'POST',
        url: `/v1/organisations/${fixture.id}/registrations/${registration.id}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
        ...asOperator(),
        payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
      })

      expect(issueResponse.statusCode).toBe(StatusCodes.FORBIDDEN)
      expect(issueResponse.payload).toContain(
        'Cannot issue a PRN on a suspended accreditation'
      )
    })

    it('permits issuing a PRN again once the accreditation has been reinstated through this endpoint', async () => {
      const fixture = buildOrgWithAccreditationStatus('suspended', {
        registrationStatus: 'approved'
      })
      const registration = fixture.registrations[0]
      const accreditationId = /** @type {string} */ (
        registration.accreditationId
      )
      const prnId = new ObjectId().toHexString()

      const packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository([
          /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} */ (
            /** @type {unknown} */ (
              buildAwaitingAuthorisationPrn({
                id: prnId,
                organisation: { id: fixture.id, name: 'Test Organisation' },
                registrationId: registration.id,
                accreditation:
                  /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote['accreditation']} */ ({
                    id: accreditationId,
                    accreditationYear: 2026
                  })
              })
            )
          )
        ])({
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
          trace: vi.fn(),
          fatal: vi.fn(),
          child: vi.fn()
        })

      // A ledger holding enough balance for the PRN's tonnage, so the issue
      // succeeds once the suspension is lifted.
      const ledgerRepository = createInMemoryLedgerRepository([
        partialMock(
          buildLedgerEvent({
            organisationId: fixture.id,
            registrationId: registration.id,
            accreditationId,
            number: 1,
            payload: { summaryLogId: 'log-1', creditTotal: 500 },
            openingBalance: { amount: 0, availableAmount: 0 },
            closingBalance: { amount: 500, availableAmount: 500 }
          })
        )
      ])()

      const integrationServer = await createTestServer({
        repositories: {
          organisationsRepository: createInMemoryOrganisationsRepository([
            fixture
          ]),
          systemLogsRepository: createSystemLogsRepository(),
          packagingRecyclingNotesRepository: () =>
            packagingRecyclingNotesRepository,
          ledgerRepository: () => ledgerRepository
        }
      })

      const reinstateResponse = await integrationServer.inject({
        method: 'POST',
        url: statusHistoryUrl({
          organisationId: fixture.id,
          registrationId: registration.id,
          accreditationId
        }),
        payload: reinstatePayload,
        ...asServiceMaintainerWrite()
      })
      expect(reinstateResponse.statusCode).toBe(StatusCodes.OK)

      const issueResponse = await integrationServer.inject({
        method: 'POST',
        url: `/v1/organisations/${fixture.id}/registrations/${registration.id}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
        ...asOperator(),
        payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
      })

      expect(issueResponse.statusCode).toBe(StatusCodes.OK)
    })

    it('refuses to issue a PRN once the accreditation has been cancelled through this endpoint', async () => {
      const fixture = buildOrgWithAccreditationStatus('suspended')
      const registration = fixture.registrations[0]
      const accreditationId = /** @type {string} */ (
        registration.accreditationId
      )
      const prnId = new ObjectId().toHexString()

      const packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository([
          /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} */ (
            /** @type {unknown} */ (
              buildAwaitingAuthorisationPrn({
                id: prnId,
                organisation: { id: fixture.id, name: 'Test Organisation' },
                registrationId: registration.id,
                accreditation:
                  /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote['accreditation']} */ ({
                    id: accreditationId
                  })
              })
            )
          )
        ])({
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
          trace: vi.fn(),
          fatal: vi.fn(),
          child: vi.fn()
        })

      const integrationServer = await createTestServer({
        repositories: {
          organisationsRepository: createInMemoryOrganisationsRepository([
            fixture
          ]),
          systemLogsRepository: createSystemLogsRepository(),
          packagingRecyclingNotesRepository: () =>
            packagingRecyclingNotesRepository
        }
      })

      const cancelResponse = await integrationServer.inject({
        method: 'POST',
        url: statusHistoryUrl({
          organisationId: fixture.id,
          registrationId: registration.id,
          accreditationId
        }),
        payload: cancelPayload,
        ...asServiceMaintainerWrite()
      })
      expect(cancelResponse.statusCode).toBe(StatusCodes.OK)

      const issueResponse = await integrationServer.inject({
        method: 'POST',
        url: `/v1/organisations/${fixture.id}/registrations/${registration.id}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
        ...asOperator(),
        payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
      })

      expect(issueResponse.statusCode).toBe(StatusCodes.FORBIDDEN)
      expect(issueResponse.payload).toContain(
        'Cannot issue a PRN on a cancelled accreditation'
      )
    })

    it('permits issuing a PRN again once the accreditation has been reinstated after an appeal through this endpoint', async () => {
      const fixture = buildOrgWithAccreditationStatus('cancelled', {
        registrationStatus: 'approved'
      })
      const registration = fixture.registrations[0]
      const accreditationId = /** @type {string} */ (
        registration.accreditationId
      )
      const prnId = new ObjectId().toHexString()

      const packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository([
          /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} */ (
            /** @type {unknown} */ (
              buildAwaitingAuthorisationPrn({
                id: prnId,
                organisation: { id: fixture.id, name: 'Test Organisation' },
                registrationId: registration.id,
                accreditation:
                  /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote['accreditation']} */ ({
                    id: accreditationId,
                    accreditationYear: 2026
                  })
              })
            )
          )
        ])({
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
          trace: vi.fn(),
          fatal: vi.fn(),
          child: vi.fn()
        })

      // A ledger holding enough balance for the PRN's tonnage, so the issue
      // succeeds once the cancellation is overturned.
      const ledgerRepository = createInMemoryLedgerRepository([
        partialMock(
          buildLedgerEvent({
            organisationId: fixture.id,
            registrationId: registration.id,
            accreditationId,
            number: 1,
            payload: { summaryLogId: 'log-1', creditTotal: 500 },
            openingBalance: { amount: 0, availableAmount: 0 },
            closingBalance: { amount: 500, availableAmount: 500 }
          })
        )
      ])()

      const integrationServer = await createTestServer({
        repositories: {
          organisationsRepository: createInMemoryOrganisationsRepository([
            fixture
          ]),
          systemLogsRepository: createSystemLogsRepository(),
          packagingRecyclingNotesRepository: () =>
            packagingRecyclingNotesRepository,
          ledgerRepository: () => ledgerRepository
        }
      })

      const reinstateResponse = await integrationServer.inject({
        method: 'POST',
        url: statusHistoryUrl({
          organisationId: fixture.id,
          registrationId: registration.id,
          accreditationId
        }),
        payload: reinstateAfterAppealPayload,
        ...asServiceMaintainerWrite()
      })
      expect(reinstateResponse.statusCode).toBe(StatusCodes.OK)

      const issueResponse = await integrationServer.inject({
        method: 'POST',
        url: `/v1/organisations/${fixture.id}/registrations/${registration.id}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
        ...asOperator(),
        payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
      })

      expect(issueResponse.statusCode).toBe(StatusCodes.OK)
    })
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => {
      const ctx = await seedOrg('approved')
      return {
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: suspendPayload
      }
    }
  })

  testOnlyServiceMaintainerCanAccess({
    server: () => server,
    makeRequest: async () => {
      const ctx = await seedOrg('approved')
      return {
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: suspendPayload
      }
    }
  })
})
