import hapi from '@hapi/hapi'
import hapiPino from 'hapi-pino'
import { afterEach, describe, expect, it } from 'vitest'

import { loggerOptions } from './logging/logger-options.js'
import { requestTracing } from './request-tracing.js'
import { config } from '#root/config.js'

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const newServer = async () => {
  const lines = []
  const stream = { write: (s) => lines.push(s) }

  const server = hapi.server({ port: 0 })
  await server.register({
    plugin: hapiPino,
    options: { ...loggerOptions, enabled: true, level: 'trace', stream }
  })
  await server.register(requestTracing)
  server.route({
    method: 'GET',
    path: '/test',
    handler: (request) => {
      request.logger.info({ message: 'inside handler' })
      return 'ok'
    }
  })

  return { server, lines }
}

const findLine = (lines, predicate) =>
  lines.map((s) => JSON.parse(s)).find(predicate)

const findHandlerLine = (lines) =>
  findLine(lines, (l) => l.message === 'inside handler')

describe('request-tracing local trace.id fallback', () => {
  afterEach(() => {
    config.reset('cdpEnvironment')
  })

  it('should mint a uuid trace.id when local and no x-cdp-request-id header is supplied', async () => {
    config.set('cdpEnvironment', 'local')
    const { server, lines } = await newServer()

    await server.inject('/test')
    const out = findHandlerLine(lines)

    expect(out?.trace?.id).toMatch(UUID_V4)
  })

  it('should not mint a trace.id when not local and no x-cdp-request-id header is supplied', async () => {
    config.set('cdpEnvironment', 'dev')
    const { server, lines } = await newServer()

    await server.inject('/test')
    const out = findHandlerLine(lines)

    expect(out).not.toHaveProperty('trace')
  })

  it('should pass through an incoming x-cdp-request-id header as trace.id regardless of environment', async () => {
    config.set('cdpEnvironment', 'prod')
    const { server, lines } = await newServer()

    await server.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-cdp-request-id': 'incoming-trace-abc' }
    })
    const out = findHandlerLine(lines)

    expect(out?.trace?.id).toBe('incoming-trace-abc')
  })

  it('should not overwrite an incoming x-cdp-request-id header when local', async () => {
    config.set('cdpEnvironment', 'local')
    const { server, lines } = await newServer()

    await server.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-cdp-request-id': 'incoming-trace-xyz' }
    })
    const out = findHandlerLine(lines)

    expect(out?.trace?.id).toBe('incoming-trace-xyz')
  })
})
