import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { ObjectId } from 'mongodb'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'

const { validToken } = entraIdMockAuthTokens

const mockCdpAuditing = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockCdpAuditing(...args)
}))

describe('PUT /v1/organisations/{id}', () => {
  setupAuthContext()
  let server
  let organisationsRepository

  beforeEach(async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags({ organisations: true })

    server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        systemLogsRepository: createSystemLogsRepository()
      },
      featureFlags
    })
  })

  afterAll(() => {
    vi.resetAllMocks()
  })

  const createOrganisation = async () => {
    const fixture = buildOrganisation()
    const organisationId = fixture.id
    await organisationsRepository.insert(fixture)

    const fetchResponse = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}`,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(fetchResponse.statusCode).toBe(StatusCodes.OK)

    return JSON.parse(fetchResponse.payload)
  }

  describe('happy path', () => {
    it('returns 200 and the updated organisation when the org Id exists, the version is correct and the fragment is valid', async () => {
      const org = await createOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: org.version,
          updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      // returned organisation should have the same id and an incremented version
      expect(body.id).toBe(org.id)
      expect(body.version).toBe(org.version + 1)
      expect(body.wasteProcessingTypes).toEqual(['reprocessor'])
    })

    it('includes Cache-Control header in successful response', async () => {
      const org = await createOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: org.version,
          updateFragment: { wasteProcessingTypes: org.wasteProcessingTypes }
        }
      })

      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })

    it('captures a system log and audit event', async () => {
      const initialOrg = await createOrganisation()
      const organisationId = initialOrg.id
      const start = new Date()

      const updateResponse = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${organisationId}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: initialOrg.version,
          updateFragment: {
            ...initialOrg,
            wasteProcessingTypes: ['reprocessor']
          }
        }
      })

      expect(updateResponse.statusCode).toBe(StatusCodes.OK)
      const updatedOrgResponseBody = JSON.parse(updateResponse.payload)

      const systemLogsResponse = await server.inject({
        method: 'GET',
        url: `/v1/system-logs?organisationId=${organisationId}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(systemLogsResponse.statusCode).toBe(StatusCodes.OK)

      const verifyCreatedBy = (payload) => {
        expect(payload.id).toEqual('test-user-id')
        expect(payload.email).toEqual('me@example.com')
        expect(payload.scope).toEqual(['service_maintainer'])
      }

      const verifyEvent = (payload) => {
        expect(payload.event.category).toEqual('entity')
        expect(payload.event.subCategory).toEqual('epr-organisations')
        expect(payload.event.action).toEqual('update')
      }

      const verifyContext = (payload) => {
        expect(payload.context.organisationId).toEqual(organisationId)
        expect(payload.context.previous).toEqual(initialOrg)
        expect(payload.context.next).toEqual(updatedOrgResponseBody)
      }

      // System log
      const systemLogsResponseBody = JSON.parse(systemLogsResponse.payload)
      expect(systemLogsResponseBody.systemLogs).toHaveLength(1)
      const systemLogPayload = systemLogsResponseBody.systemLogs[0]
      verifyCreatedBy(systemLogPayload.createdBy)
      expect(
        new Date(systemLogPayload.createdAt).getTime()
      ).toBeGreaterThanOrEqual(start.getTime())
      verifyEvent(systemLogPayload)
      verifyContext(systemLogPayload)

      // CDP audit event
      expect(mockCdpAuditing).toHaveBeenCalledTimes(1)
      // stringify then parse to coerce Date objects to ISO strings
      const auditPayload = JSON.parse(
        JSON.stringify(mockCdpAuditing.mock.calls[0][0])
      )
      verifyCreatedBy(auditPayload.user)
      verifyEvent(auditPayload)
      verifyContext(auditPayload)
    })
  })

  describe('not found cases', () => {
    describe('when the orgId does not exist', async () => {
      let response
      beforeEach(async () => {
        const org = await createOrganisation()
        const nonExistentId = new ObjectId().toString()

        response = await server.inject({
          method: 'PUT',
          url: `/v1/organisations/${nonExistentId}`,
          headers: {
            Authorization: `Bearer ${validToken}`
          },
          payload: {
            version: org.version,
            updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
          }
        })
      })

      it('returns 404 ', async () => {
        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('includes Cache-Control header in error response', async () => {
        expect(response.headers['cache-control']).toBe(
          'no-cache, no-store, must-revalidate'
        )
      })
    })

    it('returns 404 when orgId is missing (whitespace-only path segment)', async () => {
      const org = buildOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: '/v1/organisations/%20%20%20',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: org.version,
          updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('invalid payload', () => {
    it('returns 400 when version field is missing', async () => {
      const org = await createOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Payload must include a numeric version field/
      )
    })

    it('returns 400 when version field is not a number', async () => {
      const org = await createOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: 'not-a-number',
          updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Payload must include a numeric version field/
      )
    })

    it('returns 400 when updateFragment field is missing', async () => {
      const org = await createOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: org.version
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Payload must include an updateFragment object/
      )
    })

    it('returns 400 when updateFragment is null', async () => {
      const org = await createOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: org.version,
          updateFragment: null
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Payload must include an updateFragment object/
      )
    })

    it('returns 400 when updateFragment is not an object', async () => {
      const org = await createOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: org.version,
          updateFragment: 'not-an-object'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Payload must include an updateFragment object/
      )
    })
  })

  it('returns 409 when version number does not match current version', async () => {
    const org = await createOrganisation()

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/organisations/${org.id}`,
      headers: {
        Authorization: `Bearer ${validToken}`
      },
      payload: {
        version: org.version + 1,
        updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Version conflict/)
  })

  it('it includes validation error information in the response', async () => {
    const org = await createOrganisation()

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/organisations/${org.id}`,
      headers: {
        Authorization: `Bearer ${validToken}`
      },
      payload: {
        version: org.version,
        updateFragment: { ...org, wasteProcessingTypes: [] }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toBe(
      'Invalid organisation data: wasteProcessingTypes: At least one waste processing type is required'
    )
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => {
      const org1 = await createOrganisation()
      return {
        method: 'PUT',
        url: `/v1/organisations/${org1.id}`,
        payload: {
          version: org1.version,
          updateFragment: { ...org1, wasteProcessingTypes: ['reprocessor'] }
        }
      }
    },
    additionalExpectations: (response) => {
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    }
  })

  testOnlyServiceMaintainerCanAccess({
    server: () => server,
    makeRequest: async () => {
      const org1 = await createOrganisation()
      return {
        method: 'PUT',
        url: `/v1/organisations/${org1.id}`,
        payload: {
          version: org1.version,
          updateFragment: { ...org1, wasteProcessingTypes: ['reprocessor'] }
        }
      }
    }
  })
})
