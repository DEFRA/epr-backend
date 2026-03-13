import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import {
  buildOrganisation,
  getValidDateRange
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'

describe('PUT /v1/dev/organisations/{id}', () => {
  setupAuthContext()
  let server
  let organisationsRepositoryFactory
  let organisationsRepository
  const { VALID_FROM, VALID_TO } = getValidDateRange()

  beforeEach(async () => {
    organisationsRepositoryFactory = createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags({ devEndpoints: true })

    server = await createTestServer({
      repositories: { organisationsRepository: organisationsRepositoryFactory },
      featureFlags
    })
  })

  describe('feature flag disabled', () => {
    it('should return 404 when devEndpoints feature flag is disabled', async () => {
      const featureFlags = createInMemoryFeatureFlags({ devEndpoints: false })
      const testServer = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory
        },
        featureFlags
      })

      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await testServer.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('happy path', () => {
    it('should return 200 and the updated organisation', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const current = await organisationsRepository.findById(org.id)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: {
            ...current,
            wasteProcessingTypes: ['reprocessor']
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const body = JSON.parse(response.payload)
      expect(body.organisation.id).toBe(org.id)
      expect(body.organisation.version).toBe(org.version + 1)
      expect(body.organisation.wasteProcessingTypes).toEqual(['reprocessor'])
    })

    it('should preserve statusHistory exactly as provided', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const current = await organisationsRepository.findById(org.id)

      const customStatusHistory = [
        { status: 'created', updatedAt: '2024-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-01-01T00:00:00.000Z' }
      ]

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: {
            ...current,
            statusHistory: customStatusHistory
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const body = JSON.parse(response.payload)
      expect(body.organisation.statusHistory).toHaveLength(2)
      expect(body.organisation.statusHistory[1].status).toBe('approved')
      expect(body.organisation.status).toBe('approved')
    })

    it('should preserve accreditation statusHistory as provided', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const current = await organisationsRepository.findById(org.id)

      const accreditationStatusHistory = [
        { status: 'created', updatedAt: '2024-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: VALID_FROM }
      ]

      current.accreditations[0].statusHistory = accreditationStatusHistory
      current.accreditations[0].validFrom = VALID_FROM
      current.accreditations[0].validTo = VALID_TO
      current.accreditations[0].accreditationNumber = 'ACC25TEST001'

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: current
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const body = JSON.parse(response.payload)
      const acc = body.organisation.accreditations[0]
      expect(acc.statusHistory).toHaveLength(2)
      expect(acc.statusHistory[1].status).toBe('approved')
      expect(acc.status).toBe('approved')
    })

    it('should collate users when status transitions to approved', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const current = await organisationsRepository.findById(org.id)

      const customStatusHistory = [
        { status: 'created', updatedAt: '2024-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-01-01T00:00:00.000Z' }
      ]

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: {
            ...current,
            statusHistory: customStatusHistory
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const body = JSON.parse(response.payload)
      expect(body.organisation.users).toBeDefined()
      expect(body.organisation.users.length).toBeGreaterThan(0)
    })

    it('should not require authentication', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const current = await organisationsRepository.findById(org.id)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: current
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('not found cases', () => {
    it('should return 404 when the orgId does not exist', async () => {
      const org = buildOrganisation()
      const nonExistentId = new ObjectId().toString()

      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${nonExistentId}`,
        payload: {
          organisation: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('should return 422 when orgId is whitespace-only', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/v1/dev/organisations/%20%20%20',
        payload: {
          organisation: { wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe('"id" cannot be empty')
    })
  })

  describe('invalid payload', () => {
    it('should return 422 when organisation field is missing', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {}
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe('"organisation" is required')
    })

    it('should return 422 when organisation is null', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: null
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe('"organisation" must be an object')
    })

    it('should return 422 when organisation data fails schema validation', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const current = await organisationsRepository.findById(org.id)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: {
            ...current,
            wasteProcessingTypes: ['invalid_type']
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('should return 422 when organisation is not an object', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: 'not-an-object'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe('"organisation" must be an object')
    })
  })

  describe('error handling', () => {
    it('should return error when replaceRaw throws', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const current = await organisationsRepository.findById(org.id)

      // Advance the version in storage directly so the handler's replaceRaw hits a conflict
      const storage = organisationsRepository._getStorageForTesting()
      const storedOrg = storage.find((o) => o._id === org.id)
      storedOrg.version = 999

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: current
        }
      })

      expect(response.statusCode).toBeGreaterThanOrEqual(400)
    })
  })
})
