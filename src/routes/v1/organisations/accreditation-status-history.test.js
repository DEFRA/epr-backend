import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
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
 * suspending the target leaves other accreditations untouched.
 * @param {string} status
 */
const buildOrgWithAccreditationStatus = (status) => {
  const accreditationId = new ObjectId().toString()
  const registration = buildRegistration({
    accreditationId,
    reprocessingType: 'input'
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
      )
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

const suspendPayload = { status: 'suspended' }

describe('POST /v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/status-history', () => {
  setupAuthContext()
  let server

  const seedOrg = async (status) => {
    const fixture = buildOrgWithAccreditationStatus(status)
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([fixture])

    server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        systemLogsRepository: createSystemLogsRepository()
      },
      featureFlags: createInMemoryFeatureFlags()
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

  describe('invalid status transitions', () => {
    it.each(['created', 'suspended', 'rejected', 'cancelled'])(
      'returns 422 when the accreditation is currently %s',
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
          new RegExp(`Cannot transition .* from ${status} to suspended`)
        )
      }
    )
  })

  describe('payload validation', () => {
    it.each([
      ['payload is missing', undefined],
      ['status is missing', {}],
      ['status is not a supported transition target', { status: 'approved' }],
      ['status is not a known status', { status: 'nonsense' }],
      ['payload has unexpected fields', { status: 'suspended', reason: 'x' }]
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
        },
        featureFlags: createInMemoryFeatureFlags()
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
