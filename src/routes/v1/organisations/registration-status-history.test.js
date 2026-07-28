import { ledgerIdFor } from '#application/summary-logs/ledger-id.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { assertCadence } from '#reports/application/assert-cadence.js'
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
 * Builds an organisation with a target registration whose statusHistory ends
 * in the given status, plus an unrelated second (exporter) registration used
 * to assert that changing the target's status leaves other registrations
 * untouched. A created registration has no number or validFrom yet; validTo
 * is owned by the application data and, per registrationOverrides, defaults
 * to already being present so grant tests only need to supply the fields the
 * grant itself sets.
 * @param {string} status
 * @param {{ registrationOverrides?: object }} [options]
 */
const buildOrgWithRegistrationStatus = (
  status,
  { registrationOverrides = {} } = {}
) => {
  const registration = buildRegistration({
    reprocessingType: 'input',
    validTo: '2026-12-31',
    statusHistory:
      status === 'created'
        ? [{ status: 'created', updatedAt: '2024-01-01' }]
        : [
            { status: 'created', updatedAt: '2024-01-01' },
            { status, updatedAt: '2024-02-01' }
          ],
    ...(status !== 'created' && {
      registrationNumber: 'REG123456',
      validFrom: '2024-01-01'
    }),
    ...registrationOverrides
  })
  const otherRegistration = buildRegistration({
    wasteProcessingType: 'exporter'
  })

  return /** @type {import('#domain/organisations/model.js').Organisation} */ (
    /** @type {unknown} */ (
      buildOrganisation({
        registrations: [registration, otherRegistration],
        accreditations: []
      })
    )
  )
}

const statusHistoryUrl = ({ organisationId, registrationId }) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/status-history`

const grantPayload = {
  fromStatus: 'created',
  toStatus: 'approved',
  appliesFrom: '2026-08-01',
  registrationNumber: 'REG999999'
}

describe('POST /v1/organisations/{organisationId}/registrations/{registrationId}/status-history', () => {
  setupAuthContext()
  let server

  const seedOrg = async (status, options = {}) => {
    const { extraOrgs = [], ...builderOptions } = options
    const fixture = buildOrgWithRegistrationStatus(status, builderOptions)
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([fixture, ...extraOrgs])

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
    const registration = org.registrations.find(
      (reg) => reg.wasteProcessingType === 'reprocessor'
    )
    const otherRegistration = org.registrations.find(
      (reg) => reg.wasteProcessingType === 'exporter'
    )

    return {
      org,
      organisationId: org.id,
      registrationId: registration.id,
      otherRegistrationId: otherRegistration.id
    }
  }

  afterAll(() => {
    vi.resetAllMocks()
  })

  describe('granting a created registration', () => {
    const buildOrgHoldingNumber = (registrationNumber) =>
      /** @type {import('#domain/organisations/model.js').Organisation} */ (
        /** @type {unknown} */ (
          buildOrganisation({
            registrations: [buildRegistration({ registrationNumber })],
            accreditations: []
          })
        )
      )

    it('grants the registration, issuing the number and setting validFrom to appliesFrom, and returns 200 with { status: "approved" }', async () => {
      const ctx = await seedOrg('created')

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
      const registration = updatedOrg.registrations.find(
        (reg) => reg.id === ctx.registrationId
      )

      expect(registration.status).toBe('approved')
      expect(registration.registrationNumber).toBe('REG999999')
      expect(registration.validFrom).toBe('2026-08-01')
      expect(registration.validTo).toBe('2026-12-31')
      expect(registration.statusHistory.map((entry) => entry.status)).toEqual([
        'created',
        'approved'
      ])

      const otherRegistration = updatedOrg.registrations.find(
        (reg) => reg.id === ctx.otherRegistrationId
      )
      expect(otherRegistration.status).toBe('created')
    })

    it('captures a system log entry with actor and before/after status', async () => {
      const ctx = await seedOrg('created')
      const start = new Date()

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: grantPayload,
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

      const previousRegistration = entry.context.previous.registrations.find(
        (reg) => reg.id === ctx.registrationId
      )
      const nextRegistration = entry.context.next.registrations.find(
        (reg) => reg.id === ctx.registrationId
      )
      expect(previousRegistration.status).toBe('created')
      expect(nextRegistration.status).toBe('approved')

      expect(mockCdpAuditing).toHaveBeenCalledTimes(1)
    })

    it('returns 422 when the registration number is already in use by another organisation', async () => {
      const ctx = await seedOrg('created', {
        extraOrgs: [buildOrgHoldingNumber('REG555555')]
      })

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: { ...grantPayload, registrationNumber: 'REG555555' },
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Registration number REG555555 is already in use/
      )
    })

    it('returns 422 when appliesFrom is after the registration validTo', async () => {
      const ctx = await seedOrg('created')

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: { ...grantPayload, appliesFrom: '2027-06-01' },
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /appliesFrom 2027-06-01 is after validTo 2026-12-31/
      )
    })

    it('returns 422 when the registration has no validTo, which granting does not set', async () => {
      const ctx = await seedOrg('created', {
        registrationOverrides: { validTo: null }
      })

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: grantPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(/validTo/)
    })

    it.each(['approved', 'rejected', 'cancelled'])(
      'returns 422 when the registration is currently %s',
      async (status) => {
        const ctx = await seedOrg(status)

        const response = await server.inject({
          method: 'POST',
          url: statusHistoryUrl(ctx),
          payload: grantPayload,
          headers: { Authorization: `Bearer ${validToken}` }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
        const body = JSON.parse(response.payload)
        expect(body.message).toMatch(
          new RegExp(
            `Cannot transition registration from created: its status is ${status}`
          )
        )
      }
    )
  })

  describe('payload validation', () => {
    it.each([
      ['payload is missing', undefined],
      ['payload is empty', {}],
      ['payload uses the old status-only shape', { status: 'approved' }],
      [
        'the from/to pair is not a supported transition',
        { fromStatus: 'approved', toStatus: 'cancelled' }
      ],
      [
        'toStatus is not a known status',
        { fromStatus: 'created', toStatus: 'nonsense' }
      ],
      ['payload has unexpected fields', { ...grantPayload, reason: 'x' }],
      [
        'a grant is missing appliesFrom',
        { ...grantPayload, appliesFrom: undefined }
      ],
      [
        'a grant is missing the registration number',
        { ...grantPayload, registrationNumber: undefined }
      ],
      [
        'a grant has an invalid appliesFrom date',
        { ...grantPayload, appliesFrom: '2026-13-45' }
      ],
      [
        'a grant has an appliesFrom day that does not exist in that month',
        { ...grantPayload, appliesFrom: '2026-02-30' }
      ],
      [
        'a grant has an empty registration number',
        { ...grantPayload, registrationNumber: ' ' }
      ]
    ])('returns 422 when %s', async (_label, payload) => {
      const ctx = await seedOrg('created')

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
      const ctx = await seedOrg('created')
      const nonExistentOrgId = new ObjectId().toString()

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl({ ...ctx, organisationId: nonExistentOrgId }),
        payload: grantPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 when the registration does not exist on the organisation', async () => {
      const ctx = await seedOrg('created')
      const nonExistentRegistrationId = new ObjectId().toString()

      const response = await server.inject({
        method: 'POST',
        url: statusHistoryUrl({
          ...ctx,
          registrationId: nonExistentRegistrationId
        }),
        payload: grantPayload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('downstream effect: registered-only operator state after grant', () => {
    // Grant does not cascade to a linked accreditation (PAE-1599): a granted
    // registration with no accreditationId leaves the operator
    // registered-only. The four behaviours below all derive from that
    // absence and are already enforced on main (see the referenced source);
    // these tests verify they hold for a registration granted through this
    // endpoint specifically, without re-testing the behaviours themselves.
    it('cannot create a PRN for the granted registration, because it has no accreditation to create one under', async () => {
      const fixture = buildOrgWithRegistrationStatus('created')
      const registration = fixture.registrations.find(
        (reg) => reg.wasteProcessingType === 'reprocessor'
      )

      const packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository([])({
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

      const grantResponse = await integrationServer.inject({
        method: 'POST',
        url: statusHistoryUrl({
          organisationId: fixture.id,
          registrationId: registration.id
        }),
        payload: grantPayload,
        ...asServiceMaintainerWrite()
      })
      expect(grantResponse.statusCode).toBe(StatusCodes.OK)

      // Scenario 7: PRNs/PERNs cannot be issued for a registered-only
      // operator. There is no accreditation to create one under, so the
      // create endpoint 404s before considering the payload at all.
      const createResponse = await integrationServer.inject({
        method: 'POST',
        url: `/v1/organisations/${fixture.id}/registrations/${registration.id}/accreditations/${new ObjectId().toHexString()}/packaging-recycling-notes`,
        ...asOperator(),
        payload: {
          issuedToOrganisation: { id: 'org-2', name: 'Recipient Org' },
          tonnage: 10
        }
      })

      expect(createResponse.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('leaves the granted registration in the registered-only state that drives template selection, waste balance and cadence', async () => {
      const fixture = buildOrgWithRegistrationStatus('created')
      const registration = fixture.registrations.find(
        (reg) => reg.wasteProcessingType === 'reprocessor'
      )

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([fixture])

      const integrationServer = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          systemLogsRepository: createSystemLogsRepository()
        },
        featureFlags: createInMemoryFeatureFlags()
      })

      const grantResponse = await integrationServer.inject({
        method: 'POST',
        url: statusHistoryUrl({
          organisationId: fixture.id,
          registrationId: registration.id
        }),
        payload: grantPayload,
        ...asServiceMaintainerWrite()
      })
      expect(grantResponse.statusCode).toBe(StatusCodes.OK)

      // findRegistrationById is the join point that hydrates a registration
      // with its linked accreditation (repositories/organisations/inmemory.js);
      // granting never sets accreditationId, so it stays absent.
      const grantedRegistration =
        await organisationsRepositoryFactory().findRegistrationById(
          fixture.id,
          registration.id
        )
      expect(grantedRegistration.status).toBe('approved')
      expect(grantedRegistration.accreditationId).toBeUndefined()

      // Scenario 8: template selection treats the registration as
      // registered-only whenever it has no accreditation number
      // (application/summary-logs/validations/processing-type.js:22-33).
      expect(
        grantedRegistration.accreditation?.accreditationNumber
      ).toBeUndefined()

      // Scenario 9: a summary log submitted against this registration
      // appends to a registered-only ledger stream — accreditationId null —
      // which rejects PRN events (application/summary-logs/ledger-id.js;
      // waste-balances/repository/ledger-schema.js:173).
      const ledgerId = ledgerIdFor(
        /** @type {import('#application/summary-logs/validate-issue-logging.js').SubmittedSummaryLog} */ (
          /** @type {unknown} */ ({
            organisationId: fixture.id,
            registrationId: registration.id,
            file: { id: 'file-1', name: 'file.xlsx' }
          })
        ),
        grantedRegistration
      )
      expect(ledgerId.accreditationId).toBeNull()

      // Scenario 10: reporting cadence is quarterly, not monthly, for a
      // registration with no live accreditation
      // (reports/application/assert-cadence.js:19-22).
      expect(() =>
        assertCadence('quarterly', grantedRegistration)
      ).not.toThrow()
      expect(() => assertCadence('monthly', grantedRegistration)).toThrow(
        /expected 'quarterly'/
      )
    })
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => {
      const ctx = await seedOrg('created')
      return {
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: grantPayload
      }
    }
  })

  testOnlyServiceMaintainerCanAccess({
    server: () => server,
    makeRequest: async () => {
      const ctx = await seedOrg('created')
      return {
        method: 'POST',
        url: statusHistoryUrl(ctx),
        payload: grantPayload
      }
    }
  })
})
