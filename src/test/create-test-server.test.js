import { describe, it, expect, vi } from 'vitest'
import { createTestServer } from './create-test-server.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'

const { validToken } = entraIdMockAuthTokens

describe('createTestServer', () => {
  setupAuthContext()

  describe('return value', () => {
    it('returns a Hapi server instance', async () => {
      const server = await createTestServer()

      expect(server.inject).toBeTypeOf('function')
      expect(server.initialize).toBeTypeOf('function')
    })

    it('attaches loggerMocks to the server', async () => {
      const server = await createTestServer()

      expect(server.loggerMocks).toBeDefined()
      expect(server.loggerMocks.info).toBeTypeOf('function')
      expect(server.loggerMocks.error).toBeTypeOf('function')
      expect(server.loggerMocks.warn).toBeTypeOf('function')
    })
  })

  describe('default repositories', () => {
    it('provides default in-memory repositories when none specified', async () => {
      const server = await createTestServer()

      // Server should work - routes can access default repos
      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations',
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.payload)).toEqual([])
    })
  })

  describe('repository overrides', () => {
    it('uses provided repository override', async () => {
      const organisationsRepository = createInMemoryOrganisationsRepository()()
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const server = await createTestServer({
        repositories: { organisationsRepository }
      })

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${org.id}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(200)
      const result = JSON.parse(response.payload)
      expect(result.id).toBe(org.id)
    })

    it('supports mock repositories for behaviour verification', async () => {
      const mockOrg = { id: 'some-id', name: 'Mock Org' }
      const mockOrganisationsRepository = {
        findById: vi.fn().mockResolvedValue(mockOrg)
      }

      const server = await createTestServer({
        repositories: { organisationsRepository: mockOrganisationsRepository }
      })

      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations/some-id',
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.payload)).toEqual(mockOrg)
      expect(mockOrganisationsRepository.findById).toHaveBeenCalledWith(
        'some-id'
      )
    })
  })

  describe('feature flags option', () => {
    it('accepts featureFlags option for test overrides', async () => {
      const customFlags = createInMemoryFeatureFlags({
        devEndpoints: true
      })

      const server = await createTestServer({ featureFlags: customFlags })

      expect(server.featureFlags.isDevEndpointsEnabled()).toBe(true)
    })
  })

  describe('logger mocks', () => {
    it('spies on request.logger methods during requests', async () => {
      const server = await createTestServer()

      await server.inject({
        method: 'GET',
        url: '/v1/organisations',
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(vi.isMockFunction(server.loggerMocks.info)).toBe(true)
    })
  })
})
