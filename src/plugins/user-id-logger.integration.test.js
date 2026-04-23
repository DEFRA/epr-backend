import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

describe('user-id-logger integration', () => {
  setupAuthContext()

  let server
  let capturedBindings

  beforeAll(async () => {
    server = await createTestServer()

    server.route({
      method: 'GET',
      path: '/_test/authed',
      handler: (request) => {
        capturedBindings = request.logger.bindings()
        return { ok: true }
      }
    })

    server.route({
      method: 'GET',
      path: '/_test/public',
      options: { auth: false },
      handler: (request) => {
        capturedBindings = request.logger.bindings()
        return { ok: true }
      }
    })
  })

  afterAll(async () => {
    await server.stop()
  })

  it('attaches user.id binding to request-logger on authenticated routes', async () => {
    capturedBindings = null

    const response = await server.inject({
      method: 'GET',
      url: '/_test/authed',
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(200)
    expect(capturedBindings).toMatchObject({
      user: { id: 'test-maintainer-id' }
    })
  })

  it('uses injected credentials id when overridden', async () => {
    capturedBindings = null

    await server.inject({
      method: 'GET',
      url: '/_test/authed',
      ...asServiceMaintainer({ id: 'injected-user-id' })
    })

    expect(capturedBindings).toMatchObject({ user: { id: 'injected-user-id' } })
  })

  it('omits user binding on unauthenticated routes', async () => {
    capturedBindings = null

    await server.inject({ method: 'GET', url: '/_test/public' })

    expect(capturedBindings?.user).toBeUndefined()
  })

  it.each([
    ['info', 'info-message'],
    ['warn', 'warn-message'],
    ['error', 'error-message']
  ])(
    'child-logger propagates %s calls back to loggerMocks',
    async (method, message) => {
      server.route({
        method: 'GET',
        path: `/_test/log-${method}`,
        handler: (request) => {
          request.logger[method](message)
          return { ok: true }
        }
      })

      server.loggerMocks[method].mockClear()

      await server.inject({
        method: 'GET',
        url: `/_test/log-${method}`,
        ...asServiceMaintainer()
      })

      expect(server.loggerMocks[method]).toHaveBeenCalledWith(message)
    }
  )
})
