import hapi from '@hapi/hapi'
import hapiPino from 'hapi-pino'
import pino from 'pino'
import { afterEach, describe, expect, it } from 'vitest'

import { logger } from './logger.js'
import { loggerOptions } from './logger-options.js'
import { config } from '#root/config.js'

const newServer = async () => {
  const lines = []
  const stream = { write: (s) => lines.push(s) }

  const server = hapi.server({ port: 0 })
  await server.register({
    plugin: hapiPino,
    options: { ...loggerOptions, enabled: true, level: 'trace', stream }
  })

  return { server, lines }
}

const findLine = (lines, predicate) =>
  lines.map((s) => JSON.parse(s)).find(predicate)

describe('request-logger integration (hapi-pino + pino + ecs format)', () => {
  afterEach(() => {
    config.reset('cdpEnvironment')
  })

  it('should emit a canonical IndexedLogProperties payload through hapi-pino unchanged', async () => {
    config.set('cdpEnvironment', 'dev')
    const { server, lines } = await newServer()
    server.route({
      method: 'GET',
      path: '/test',
      handler: (request) => {
        request.logger.info({
          message: 'test event',
          event: { action: 'test_event' }
        })
        return 'ok'
      }
    })

    await server.inject('/test')
    const out = findLine(lines, (l) => l.message === 'test event')

    expect(out).toMatchObject({
      message: 'test event',
      event: { action: 'test_event' },
      'log.level': 'info'
    })
  })

  it('should map a logged err to ECS error.* when cdpEnvironment is non-prod', async () => {
    config.set('cdpEnvironment', 'dev')
    const { server, lines } = await newServer()
    server.route({
      method: 'GET',
      path: '/test',
      handler: (request) => {
        request.logger.error({ message: 'boom path', err: new Error('boom') })
        return 'ok'
      }
    })

    await server.inject('/test')
    const out = findLine(lines, (l) => l.message === 'boom path')

    expect(out?.error).toStrictEqual(
      expect.objectContaining({
        type: 'Error',
        message: 'boom',
        stack_trace: expect.stringContaining('Error: boom')
      })
    )
  })

  it('should strip error.stack_trace when cdpEnvironment is prod', async () => {
    config.set('cdpEnvironment', 'prod')
    const { server, lines } = await newServer()
    server.route({
      method: 'GET',
      path: '/test',
      handler: (request) => {
        request.logger.error({ message: 'boom path', err: new Error('boom') })
        return 'ok'
      }
    })

    await server.inject('/test')
    const out = findLine(lines, (l) => l.message === 'boom path')

    expect(out?.error).toBeDefined()
    expect(out?.error).not.toHaveProperty('stack_trace')
  })

  it('should land trace.id on the wire when bound via logger.child (queue-consumer pattern)', () => {
    // Documents the wire shape produced by the trace.id binding used in
    // src/server/queue-consumer/consumer.js. CDP's indexed-fields allowlist
    // does not include a top-level `trace.id` (only `amazon/trace.id` which is
    // CDP-reserved), so the trace context emitted here is dropped at ingest.
    // This test pins the current wire shape so any future change is visible.
    const lines = []
    const stream = { write: (s) => lines.push(s) }
    const { transport: _transport, ...rest } = loggerOptions
    const captureLogger = pino(
      { ...rest, enabled: true, level: 'trace' },
      stream
    )

    const child = captureLogger.child({ trace: { id: 'trace-abc' } })
    child.info({ message: 'queued' })

    const out = JSON.parse(lines[0])
    expect(out).toMatchObject({
      message: 'queued',
      trace: { id: 'trace-abc' }
    })
  })

  it.each(['info', 'error', 'warn', 'debug', 'trace', 'fatal', 'child'])(
    'exposes %s on the singleton logger import',
    (method) => {
      expect(logger[method]).toBeTypeOf('function')
    }
  )
})
