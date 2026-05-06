import { afterEach, describe, expect, it } from 'vitest'

import { requestTracing } from './request-tracing.js'
import { config } from '#root/config.js'
import { createLogCaptureServer } from '#test/log-capture-server.js'

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const newServer = async () => {
  const captured = await createLogCaptureServer()
  await captured.server.register(requestTracing)
  captured.server.route({
    method: 'GET',
    path: '/test',
    handler: (request) => {
      request.logger.info({ message: 'inside handler' })
      return 'ok'
    }
  })
  return captured
}

describe('#request-tracing', () => {
  describe('local trace.id fallback', () => {
    afterEach(() => {
      config.reset('cdpEnvironment')
    })

    it('should mint a uuid trace.id when local and no x-cdp-request-id header is supplied', async () => {
      config.set('cdpEnvironment', 'local')
      const { server, findLine } = await newServer()

      await server.inject('/test')
      const out = findLine((l) => l.message === 'inside handler')

      expect(out?.trace?.id).toMatch(UUID_V4)
    })

    it('should not mint a trace.id when not local and no x-cdp-request-id header is supplied', async () => {
      config.set('cdpEnvironment', 'dev')
      const { server, findLine } = await newServer()

      await server.inject('/test')
      const out = findLine((l) => l.message === 'inside handler')

      expect(out).not.toHaveProperty('trace')
    })

    it('should pass through an incoming x-cdp-request-id header as trace.id regardless of environment', async () => {
      config.set('cdpEnvironment', 'prod')
      const { server, findLine } = await newServer()

      await server.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-cdp-request-id': 'incoming-trace-abc' }
      })
      const out = findLine((l) => l.message === 'inside handler')

      expect(out?.trace?.id).toBe('incoming-trace-abc')
    })

    it('should not overwrite an incoming x-cdp-request-id header when local', async () => {
      config.set('cdpEnvironment', 'local')
      const { server, findLine } = await newServer()

      await server.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-cdp-request-id': 'incoming-trace-xyz' }
      })
      const out = findLine((l) => l.message === 'inside handler')

      expect(out?.trace?.id).toBe('incoming-trace-xyz')
    })
  })
})
