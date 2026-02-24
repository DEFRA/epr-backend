import { describe, it, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'

const { validToken, nonServiceMaintainerUserToken } = entraIdMockAuthTokens

describe('GET /v1/me/roles', () => {
  setupAuthContext()
  let server

  beforeEach(async () => {
    const featureFlags = createInMemoryFeatureFlags({})
    server = await createTestServer({ featureFlags })
  })

  it('returns roles for a service maintainer', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/me/roles',
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toEqual({ roles: ['service_maintainer'] })
  })

  it('returns empty roles for a non-service-maintainer user', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/me/roles',
      headers: {
        Authorization: `Bearer ${nonServiceMaintainerUserToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toEqual({ roles: [] })
  })

  it('returns 401 for unauthenticated request', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/me/roles'
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => ({
      method: 'GET',
      url: '/v1/me/roles'
    })
  })
})
