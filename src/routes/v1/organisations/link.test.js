// This test file tests the /organisations/link endpoint
// The endpoint can only be accessed with a valid Defra ID token by users who are marked as initial users
// of the organisation. The authentication and authorization logic is handled by the auth plugin via
// isAuthorisedOrgLinkingReq, which validates the token and checks if the user is an initial user.
//
// Note: The endpoint currently relies on server.app values (defraIdOrgId, organisationId) being set
// by the auth flow. In a test environment, server.app doesn't persist across inject calls, so these
// tests have limited coverage of the full authentication flow. The auth validation itself is tested
// in the auth plugin tests.

import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { defraIdMockAuthTokens } from '#vite/helpers/create-defra-id-test-tokens.js'

const { validToken } = defraIdMockAuthTokens

describe('POST /v1/organisations/{organisationId}/link', () => {
  setupAuthContext()
  let server
  let organisationsRepositoryFactory
  let organisationsRepository

  beforeEach(async () => {
    organisationsRepositoryFactory = createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags({
      organisations: true,
      defraIdAuth: true
    })

    server = await createTestServer({
      repositories: { organisationsRepository: organisationsRepositoryFactory },
      featureFlags
    })
  })

  // Note: Happy path tests for successful organisation linking are limited because
  // the endpoint relies on server.app values (defraIdOrgId, organisationId) being set
  // by the auth plugin during request validation. In test environments using server.inject,
  // server.app doesn't persist in the expected way, making it difficult to test the full
  // successful flow without integration tests.

  describe('not found cases', () => {
    it('returns 404 when organisationId is not set (auth plugin context)', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      // The handler checks for organisationId from server.app
      // If not present, it returns 404 with 'Organisation not found'
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${org.id}/link`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe('Organisation not found')
    })

    it('includes Cache-Control header in not found response', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/organisations/507f1f77bcf86cd799439011/link',
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })
  })

  describe('authentication and authorization', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${org.id}/link`
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('is configured to require authentication', () => {
      // Verify the route configuration requires auth
      const routes = server.table()
      const linkRoute = routes.find((r) =>
        r.path.includes('/organisations/{organisationId}/link')
      )

      expect(linkRoute).toBeDefined()
      expect(linkRoute.settings.auth).not.toBe(false)
    })
  })

  describe('route configuration', () => {
    it('is configured as a POST endpoint', () => {
      const routes = server.table()
      const linkRoute = routes.find((r) =>
        r.path.includes('/organisations/{organisationId}/link')
      )

      expect(linkRoute).toBeDefined()
      expect(linkRoute.method).toBe('post')
    })

    it('has the correct path pattern', () => {
      const routes = server.table()
      const linkRoute = routes.find((r) =>
        r.path.includes('/organisations/{organisationId}/link')
      )

      expect(linkRoute.path).toBe('/v1/organisations/{organisationId}/link')
    })
  })

  describe('handler behavior validation', () => {
    it('endpoint exists and handles missing organisationId in auth context', async () => {
      // This tests that when server.app doesn't have organisationId
      // (which would normally be set by the auth plugin), the endpoint
      // correctly returns 404 with the expected error message
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${org.id}/link`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      // When organisationId is not in server.app, handler returns 404
      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe('Organisation not found')
    })
  })
})
