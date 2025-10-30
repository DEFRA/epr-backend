import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'

describe('GET /v1/organisations/{id}', () => {
  let server
  let organisationsRepositoryFactory
  let organisationsRepository

  beforeEach(async () => {
    organisationsRepositoryFactory = createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags({ organisations: true })

    server = await createTestServer({
      repositories: { organisationsRepository: organisationsRepositoryFactory },
      featureFlags
    })
  })

  describe('happy path', () => {
    it('returns 200 and the organisation when found', async () => {
      const org1 = buildOrganisation()
      const org2 = buildOrganisation()

      await organisationsRepository.insert(org1)
      await organisationsRepository.insert(org2)

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${org1.id}`
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.id).toBe(org1.id)
      expect(result.orgId).toBe(org1.orgId)
    })

    it('includes Cache-Control header in successful response', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${org.id}`
      })

      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })
  })

  describe('not found cases', () => {
    it('returns 404 for orgId that does not exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations/999999'
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 when orgId is missing (whitespace-only path segment)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations/%20%20%20'
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('includes Cache-Control header in error response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations/999999'
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })
  })
})
