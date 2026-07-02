import { describe, expect, it } from 'vitest'
import { createTestServer } from '#test/create-test-server.js'
import { StatusCodes } from 'http-status-codes'
import { STRATEGY_NAME as BASIC_AUTH } from '#plugins/auth/basic-auth-plugin.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

describe('basic-auth strategy', () => {
  setupAuthContext()

  const validCredentials = Buffer.from('basic-auth-user:changeme').toString(
    'base64'
  )

  const testRoute = {
    method: 'GET',
    path: '/test-basic-auth',
    options: {
      auth: {
        strategies: ['access-token', BASIC_AUTH]
      }
    },
    handler: () => 'Hello, world!'
  }

  describe('when basic-auth credentials are configured', () => {
    /**
     * @type {import('#test/create-test-server.js').TestServer}
     */
    let server

    beforeEach(async () => {
      server = await createTestServer({
        config: {
          basicAuth: {
            username: 'basic-auth-user',
            password: 'changeme'
          }
        }
      })

      server.route(testRoute)
    })

    it('returns 200 with valid Basic Auth credentials', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test-basic-auth',
        headers: { Authorization: `Basic ${validCredentials}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns 401 with wrong password', async () => {
      const encoded = Buffer.from('basic-auth-user:wrong').toString('base64')
      const response = await server.inject({
        method: 'GET',
        url: '/test-basic-auth',
        headers: { Authorization: `Basic ${encoded}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 401 with wrong username', async () => {
      const encoded = Buffer.from('wrong:changeme').toString('base64')
      const response = await server.inject({
        method: 'GET',
        url: '/test-basic-auth',
        headers: { Authorization: `Basic ${encoded}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 401 with malformed Basic Auth value', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test-basic-auth',
        headers: { Authorization: 'Basic notbase64credentials' }
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 401 with Authorization header that does not provide a basic auth value', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test-basic-auth',
        headers: { Authorization: 'not a basic auth value' }
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 401 with no Authorization header', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test-basic-auth'
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })
  })

  describe('when basic-auth credentials are not configured', () => {
    it('returns 401 with valid Basic Auth credentials', async () => {
      const server = await createTestServer({
        config: {
          basicAuth: {
            username: '', // matches default value in config.js
            password: '' // matches default value in config.js
          }
        }
      })

      server.route(testRoute)

      const response = await server.inject({
        method: 'GET',
        url: '/test-basic-auth',
        headers: { Authorization: `Basic ${validCredentials}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })
  })
})
