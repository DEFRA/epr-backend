import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'

describe('PUT /v1/dev/organisations/{id}/accreditations/{accreditationId}/status-history', () => {
  setupAuthContext()
  let server
  let organisationsRepositoryFactory
  let organisationsRepository
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
      const accreditationId = org.accreditations[0].id

      const response = await testServer.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}/accreditations/${accreditationId}/status-history`,
        payload: {
          statusHistory: [
            { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2025-01-02T00:00:00.000Z' }
          ]
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('happy path', () => {
    it('should overwrite statusHistory and return the updated organisation', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)
      const accreditationId = org.accreditations[0].id

      const newStatusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-01-02T00:00:00.000Z' }
      ]

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}/accreditations/${accreditationId}/status-history`,
        payload: { statusHistory: newStatusHistory }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const body = JSON.parse(response.payload)
      const updatedAcc = body.organisation.accreditations.find(
        (a) => a.id === accreditationId
      )

      expect(updatedAcc.statusHistory).toHaveLength(2)
      expect(updatedAcc.statusHistory[0].status).toBe('created')
      expect(updatedAcc.statusHistory[1].status).toBe('approved')
      expect(body.organisation.version).toBe(org.version + 1)
    })

    it('should not require authentication', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)
      const accreditationId = org.accreditations[0].id

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}/accreditations/${accreditationId}/status-history`,
        payload: {
          statusHistory: [
            { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' }
          ]
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('should support suspended status in history', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)
      const accreditationId = org.accreditations[0].id

      const newStatusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-01-02T00:00:00.000Z' },
        { status: 'suspended', updatedAt: '2025-06-01T00:00:00.000Z' }
      ]

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}/accreditations/${accreditationId}/status-history`,
        payload: { statusHistory: newStatusHistory }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const body = JSON.parse(response.payload)
      const updatedAcc = body.organisation.accreditations.find(
        (a) => a.id === accreditationId
      )

      expect(updatedAcc.statusHistory).toHaveLength(3)
      expect(updatedAcc.statusHistory[2].status).toBe('suspended')
    })
  })

  describe('not found cases', () => {
    it('should return 404 when org ID does not exist', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)
      const nonExistentId = new ObjectId().toString()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${nonExistentId}/accreditations/${org.accreditations[0].id}/status-history`,
        payload: {
          statusHistory: [
            { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' }
          ]
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('should return 404 when accreditation ID does not exist', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)
      const nonExistentAccId = new ObjectId().toString()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}/accreditations/${nonExistentAccId}/status-history`,
        payload: {
          statusHistory: [
            { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' }
          ]
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('validation errors', () => {
    it('should return 422 when statusHistory is missing', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}/accreditations/${org.accreditations[0].id}/status-history`,
        payload: {}
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('should return 422 when statusHistory is empty', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}/accreditations/${org.accreditations[0].id}/status-history`,
        payload: { statusHistory: [] }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('should return 422 when status value is invalid', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}/accreditations/${org.accreditations[0].id}/status-history`,
        payload: {
          statusHistory: [
            { status: 'invalid-status', updatedAt: '2025-01-01T00:00:00.000Z' }
          ]
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('should return 422 when updatedAt is missing', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}/accreditations/${org.accreditations[0].id}/status-history`,
        payload: {
          statusHistory: [{ status: 'created' }]
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('should return 422 when id param is whitespace-only', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/v1/dev/organisations/%20%20%20/accreditations/some-id/status-history',
        payload: {
          statusHistory: [
            { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' }
          ]
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })
})
