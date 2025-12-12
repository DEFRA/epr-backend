import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { orgAccessTestPlugin } from './org-access-test-plugin.js'
import { createInMemoryAuthContext } from '#common/helpers/auth/auth-context-adapter.js'

describe('orgAccessTestPlugin (test infrastructure)', () => {
  let server
  let authContext

  beforeEach(async () => {
    const { default: Hapi } = await import('@hapi/hapi')
    server = Hapi.server()

    authContext = createInMemoryAuthContext()

    server.auth.scheme('test', () => ({
      authenticate: (request, h) => {
        const userId = request.headers.userid
        if (!userId) {
          return h.unauthenticated(new Error('Missing auth'))
        }
        return h.authenticated({ credentials: { id: userId } })
      }
    }))
    server.auth.strategy('test-strategy', 'test')

    await server.register({
      plugin: orgAccessTestPlugin,
      options: { authContext }
    })
  })

  describe('routes without organisationId param', () => {
    it('allows access to routes without organisationId', async () => {
      server.route({
        method: 'GET',
        path: '/health',
        options: { auth: false },
        handler: () => ({ status: 'ok' })
      })

      await server.initialize()
      const response = await server.inject({ method: 'GET', url: '/health' })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('authenticated requests with org access', () => {
    it('allows access when user is linked to organisation', async () => {
      authContext.grantAccess('alice', 'org-123')

      server.route({
        method: 'GET',
        path: '/organisations/{organisationId}/data',
        options: { auth: { strategy: 'test-strategy' } },
        handler: () => ({ data: 'secret' })
      })

      await server.initialize()
      const response = await server.inject({
        method: 'GET',
        url: '/organisations/org-123/data',
        headers: { userId: 'alice' }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('denies access when user is not linked to organisation', async () => {
      authContext.grantAccess('alice', 'org-456') // Linked to different org

      server.route({
        method: 'GET',
        path: '/organisations/{organisationId}/data',
        options: { auth: { strategy: 'test-strategy' } },
        handler: () => ({ data: 'secret' })
      })

      await server.initialize()
      const response = await server.inject({
        method: 'GET',
        url: '/organisations/org-123/data',
        headers: { userId: 'alice' }
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      expect(JSON.parse(response.payload).message).toBe(
        'Not linked to this organisation'
      )
    })

    it('denies access when user has no org access at all', async () => {
      // No grantAccess call - alice has no access to any org

      server.route({
        method: 'GET',
        path: '/organisations/{organisationId}/data',
        options: { auth: { strategy: 'test-strategy' } },
        handler: () => ({ data: 'secret' })
      })

      await server.initialize()
      const response = await server.inject({
        method: 'GET',
        url: '/organisations/org-123/data',
        headers: { userId: 'alice' }
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })
})
