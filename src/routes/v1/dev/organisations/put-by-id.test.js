import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'

import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

describe('PUT /v1/dev/organisations/{id}', () => {
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

      const response = await testServer.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: { wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('happy path', () => {
    it('should return 200 and the updated organisation with auto-fetched version', async () => {
      const org = buildOrganisation()

      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const body = JSON.parse(response.payload)
      expect(body.organisation.id).toBe(org.id)
      expect(body.organisation.version).toBe(org.version + 1)
      expect(body.organisation.wasteProcessingTypes).toEqual(['reprocessor'])
    })

    it('should include Cache-Control header in successful response', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: { wasteProcessingTypes: org.wasteProcessingTypes }
        }
      })

      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })

    it('should not require authentication', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: {
          organisation: { wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('not found cases', () => {
    describe('when the orgId does not exist', () => {
      let response

      beforeEach(async () => {
        const org = buildOrganisation()
        const nonExistentId = new ObjectId().toString()

        await organisationsRepository.insert(org)

        response = await server.inject({
          method: 'PUT',
          url: `/v1/dev/organisations/${nonExistentId}`,
          payload: {
            organisation: { ...org, wasteProcessingTypes: ['reprocessor'] }
          }
        })
      })

      it('should return 404', () => {
        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('should include Cache-Control header in error response', () => {
        expect(response.headers['cache-control']).toBe(
          'no-cache, no-store, must-revalidate'
        )
      })
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

  it('should include validation error information in the response', async () => {
    const org = buildOrganisation()
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/dev/organisations/${org.id}`,
      payload: {
        organisation: { ...org, wasteProcessingTypes: [] }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toBe(
      'Invalid organisation data: wasteProcessingTypes: array.min'
    )
  })
})
