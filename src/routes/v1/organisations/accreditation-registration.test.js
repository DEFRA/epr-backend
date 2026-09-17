import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'
import { accreditationRegistrationPath } from './accreditation-registration.js'

const { validToken } = entraIdMockAuthTokens

const mockCdpAuditing = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockCdpAuditing(...args)
}))

const EXPORTER_ONLY_FIELDS = {
  site: undefined,
  orsFileUploads: [
    {
      defraFormUploadedFileId: 'file-ors',
      defraFormUserDownloadLink: 'https://example.com/ors'
    }
  ]
}

/**
 * An approved reprocessor registration with no accreditation of its own, and
 * an orphaned accreditation that matches it on every identity field except
 * reprocessingType — which an unlinked accreditation never has.
 * @param {{
 *   registrationOverrides?: object,
 *   accreditationOverrides?: object,
 *   extraRegistrations?: object[],
 *   extraAccreditations?: object[]
 * }} [options]
 */
const buildOrgWithOrphanAccreditation = ({
  registrationOverrides = {},
  accreditationOverrides = {},
  extraRegistrations = [],
  extraAccreditations = []
} = {}) => {
  const registration = buildRegistration({
    reprocessingType: 'input',
    registrationNumber: 'REG123456',
    validFrom: '2024-01-01',
    validTo: '2026-12-31',
    statusHistory: [
      { status: 'created', updatedAt: '2024-01-01' },
      { status: 'approved', updatedAt: '2024-02-01' }
    ],
    ...registrationOverrides
  })
  const accreditation = buildAccreditation({
    statusHistory: [{ status: 'created', updatedAt: '2024-01-01' }],
    ...accreditationOverrides
  })

  return /** @type {import('#domain/organisations/model.js').Organisation} */ (
    /** @type {unknown} */ (
      buildOrganisation({
        registrations: [registration, ...extraRegistrations],
        accreditations: [accreditation, ...extraAccreditations]
      })
    )
  )
}

const assignUrl = ({ organisationId, accreditationId }) =>
  accreditationRegistrationPath
    .replace('{organisationId}', organisationId)
    .replace('{accreditationId}', accreditationId)

describe(`POST ${accreditationRegistrationPath}`, () => {
  setupAuthContext()
  let server

  const seedOrg = async (options = {}) => {
    const fixture = buildOrgWithOrphanAccreditation(options)

    server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          fixture
        ]),
        systemLogsRepository: createSystemLogsRepository()
      },
      featureFlags: createInMemoryFeatureFlags()
    })

    return {
      organisationId: fixture.id,
      registrationId: fixture.registrations[0].id,
      accreditationId: fixture.accreditations[0].id
    }
  }

  const assign = (ctx, overrides = {}) =>
    server.inject({
      method: 'POST',
      url: assignUrl({ ...ctx, ...overrides }),
      payload: {
        registrationId: overrides.registrationId ?? ctx.registrationId
      },
      headers: { Authorization: `Bearer ${validToken}` }
    })

  const fetchOrganisation = async (ctx) => {
    const response = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${ctx.organisationId}`,
      headers: { Authorization: `Bearer ${validToken}` }
    })
    expect(response.statusCode).toBe(StatusCodes.OK)
    return JSON.parse(response.payload)
  }

  afterAll(() => {
    vi.resetAllMocks()
  })

  describe('assigning an unlinked accreditation', () => {
    it('links the accreditation to the registration, leaving the other registrations and accreditations alone, and returns 204', async () => {
      const otherRegistration = buildRegistration({
        wasteProcessingType: 'exporter'
      })
      const otherAccreditation = buildAccreditation({
        statusHistory: [{ status: 'created', updatedAt: '2024-01-01' }]
      })
      const ctx = await seedOrg({
        extraRegistrations: [otherRegistration],
        extraAccreditations: [otherAccreditation]
      })

      const response = await assign(ctx)

      expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)

      const org = await fetchOrganisation(ctx)
      const registration = org.registrations.find(
        (reg) => reg.id === ctx.registrationId
      )
      expect(registration.accreditationId).toBe(ctx.accreditationId)

      expect(
        org.registrations.find((reg) => reg.id === otherRegistration.id)
          .accreditationId
      ).toBeUndefined()
      expect(
        org.accreditations.find((acc) => acc.id === otherAccreditation.id)
          .reprocessingType
      ).toBeNull()
    })

    it('copies the registration reprocessingType onto the accreditation', async () => {
      const ctx = await seedOrg({
        registrationOverrides: { reprocessingType: 'output' }
      })

      expect((await assign(ctx)).statusCode).toBe(StatusCodes.NO_CONTENT)

      const org = await fetchOrganisation(ctx)
      const accreditation = org.accreditations.find(
        (acc) => acc.id === ctx.accreditationId
      )
      expect(accreditation.reprocessingType).toBe('output')
    })

    it('leaves the pair matched, so a later organisation write succeeds', async () => {
      const ctx = await seedOrg()
      expect((await assign(ctx)).statusCode).toBe(StatusCodes.NO_CONTENT)

      // Any subsequent write revalidates the registration/accreditation
      // identity keys. Without the reprocessingType copy this 422s.
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${ctx.organisationId}/registrations/${ctx.registrationId}/accreditations/${ctx.accreditationId}/status-history`,
        payload: { fromStatus: 'created', toStatus: 'rejected' },
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('captures a system log entry with actor and before/after link', async () => {
      const ctx = await seedOrg()
      const start = new Date()

      expect((await assign(ctx)).statusCode).toBe(StatusCodes.NO_CONTENT)

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

      const previous = entry.context.previous.registrations.find(
        (reg) => reg.id === ctx.registrationId
      )
      const next = entry.context.next.registrations.find(
        (reg) => reg.id === ctx.registrationId
      )
      expect(previous.accreditationId).toBeUndefined()
      expect(next.accreditationId).toBe(ctx.accreditationId)

      expect(mockCdpAuditing).toHaveBeenCalledTimes(1)
    })
  })

  describe('rejected candidates', () => {
    it('returns 422 when the registration is not approved', async () => {
      const ctx = await seedOrg({
        registrationOverrides: {
          registrationNumber: null,
          validFrom: null,
          statusHistory: [{ status: 'created', updatedAt: '2024-01-01' }]
        }
      })

      const response = await assign(ctx)

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      expect(JSON.parse(response.payload).message).toMatch(
        /is created, not approved/
      )
    })

    it('returns 422 when the materials differ', async () => {
      const ctx = await seedOrg({
        accreditationOverrides: {
          material: 'plastic',
          glassRecyclingProcess: null
        }
      })

      const response = await assign(ctx)

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      expect(JSON.parse(response.payload).message).toMatch(
        /registration material glass does not match accreditation material plastic/
      )
    })

    it('returns 422 when the processing types differ', async () => {
      const ctx = await seedOrg({
        accreditationOverrides: {
          wasteProcessingType: 'exporter',
          ...EXPORTER_ONLY_FIELDS
        }
      })

      const response = await assign(ctx)

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      expect(JSON.parse(response.payload).message).toMatch(
        /registration processing type reprocessor does not match accreditation processing type exporter/
      )
    })

    it('returns 422 when the reprocessor sites differ', async () => {
      const ctx = await seedOrg({
        accreditationOverrides: {
          site: {
            address: { line1: '9 Other processing site', postcode: 'ZZ1 1ZZ' }
          }
        }
      })

      const response = await assign(ctx)

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      expect(JSON.parse(response.payload).message).toMatch(
        /is at a different site to the accreditation/
      )
    })

    it('returns 422 when the registration has no reprocessingType', async () => {
      const ctx = await seedOrg({
        registrationOverrides: { reprocessingType: null }
      })

      const response = await assign(ctx)

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      expect(JSON.parse(response.payload).message).toMatch(
        /has no reprocessingType/
      )
    })

    it('returns 422 when the registration is already linked to another accreditation', async () => {
      const otherAccreditationId = new ObjectId().toString()
      const ctx = await seedOrg({
        registrationOverrides: { accreditationId: otherAccreditationId },
        extraAccreditations: [
          buildAccreditation({
            id: otherAccreditationId,
            reprocessingType: 'input',
            statusHistory: [{ status: 'created', updatedAt: '2024-01-01' }]
          })
        ]
      })

      const response = await assign(ctx)

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      expect(JSON.parse(response.payload).message).toMatch(
        new RegExp(`is already linked to accreditation ${otherAccreditationId}`)
      )
    })

    it('returns 422 when the accreditation is already linked to another registration', async () => {
      const holder = buildRegistration({
        statusHistory: [{ status: 'created', updatedAt: '2024-01-01' }]
      })
      const fixture = buildOrgWithOrphanAccreditation({
        extraRegistrations: [holder]
      })
      fixture.registrations[1].accreditationId = fixture.accreditations[0].id

      server = await createTestServer({
        repositories: {
          organisationsRepository: createInMemoryOrganisationsRepository([
            fixture
          ]),
          systemLogsRepository: createSystemLogsRepository()
        },
        featureFlags: createInMemoryFeatureFlags()
      })

      const ctx = {
        organisationId: fixture.id,
        registrationId: fixture.registrations[0].id,
        accreditationId: fixture.accreditations[0].id
      }

      const response = await assign(ctx)

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      expect(JSON.parse(response.payload).message).toMatch(
        new RegExp(
          `is already linked to registration ${fixture.registrations[1].id}`
        )
      )
    })
  })

  describe('payload validation', () => {
    it.each([
      ['the payload is missing', undefined],
      ['the payload is empty', {}],
      ['registrationId is blank', { registrationId: ' ' }],
      [
        'the payload has unexpected fields',
        { registrationId: 'x', accreditationId: 'y' }
      ]
    ])('returns 422 when %s', async (_label, payload) => {
      const ctx = await seedOrg()

      const response = await server.inject({
        method: 'POST',
        url: assignUrl(ctx),
        payload,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('not found cases', () => {
    it('returns 404 when the organisation does not exist', async () => {
      const ctx = await seedOrg()

      const response = await assign({
        ...ctx,
        organisationId: new ObjectId().toString()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 when the accreditation does not exist on the organisation', async () => {
      const ctx = await seedOrg()

      const response = await assign({
        ...ctx,
        accreditationId: new ObjectId().toString()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 when the registration does not exist on the organisation', async () => {
      const ctx = await seedOrg()

      const response = await assign(ctx, {
        registrationId: new ObjectId().toString()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => {
      const ctx = await seedOrg()
      return {
        method: 'POST',
        url: assignUrl(ctx),
        payload: { registrationId: ctx.registrationId }
      }
    }
  })

  testOnlyServiceMaintainerCanAccess({
    server: () => server,
    makeRequest: async () => {
      const ctx = await seedOrg()
      return {
        method: 'POST',
        url: assignUrl(ctx),
        payload: { registrationId: ctx.registrationId }
      }
    },
    successStatus: StatusCodes.NO_CONTENT
  })
})
