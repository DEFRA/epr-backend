import pino from 'pino'
import { afterEach, describe, expect, it } from 'vitest'

import { config } from '#root/config.js'
import { loggerOptions } from './logger-options.js'

const captureLine = () => {
  const lines = []
  const stream = { write: (s) => lines.push(s) }
  return { stream, lines }
}

const newLogger = () => {
  const { stream, lines } = captureLine()
  const logger = pino(
    { ...loggerOptions, enabled: true, level: 'trace' },
    stream
  )
  return { logger, lines }
}

describe('loggerOptions.formatters.log', () => {
  afterEach(() => {
    config.reset('cdpEnvironment')
  })

  it('should preserve error.stack_trace when cdpEnvironment is non-prod', () => {
    config.set('cdpEnvironment', 'dev')
    const { logger, lines } = newLogger()

    logger.error({ err: new Error('boom') }, 'failed')
    const out = JSON.parse(lines[0])

    expect(out.error.stack_trace).toEqual(
      expect.stringContaining('Error: boom')
    )
  })

  it('should strip error.stack_trace when cdpEnvironment is prod', () => {
    config.set('cdpEnvironment', 'prod')
    const { logger, lines } = newLogger()

    logger.error({ err: new Error('boom') }, 'failed')
    const out = JSON.parse(lines[0])

    expect(out.error).toBeDefined()
    expect(out.error).not.toHaveProperty('stack_trace')
  })

  it('should strip error.stack_trace from manually constructed error block in prod', () => {
    config.set('cdpEnvironment', 'prod')
    const { logger, lines } = newLogger()

    logger.warn({
      message: 'boom plugin shape',
      error: {
        code: '400',
        message: 'bad',
        stack_trace: 'Error: bad\n    at frame',
        type: 'Bad Request'
      }
    })
    const out = JSON.parse(lines[0])

    expect(out.error).toEqual({
      code: '400',
      message: 'bad',
      type: 'Bad Request'
    })
  })
})
