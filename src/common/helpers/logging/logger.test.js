import { describe, test, expect, vi, beforeEach } from 'vitest'

import { loggerOptions } from './logger-options.js'

// Must mock config before importing logger-options
vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      const values = {
        log: {
          isEnabled: true,
          level: 'info',
          format: 'pino-pretty',
          redact: []
        },
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        cdpEnvironment: 'test' // non-prod by default
      }
      return values[key]
    })
  }
}))

describe('loggerOptions.serializers.error', () => {
  const { error: errorSerializer } = loggerOptions.serializers

  test('formats Error instance correctly', () => {
    const error = new Error('Something went wrong')
    const result = errorSerializer(error)

    expect(result).toEqual({
      message: 'Something went wrong',
      stack_trace: expect.stringContaining('Error: Something went wrong'),
      type: 'Error'
    })
  })

  test('formats custom Error subclass correctly', () => {
    class CustomError extends Error {
      constructor(message) {
        super(message)
        this.name = 'CustomError'
      }
    }

    const error = new CustomError('Custom error message')
    const result = errorSerializer(error)

    expect(result).toEqual({
      message: 'Custom error message',
      stack_trace: expect.stringContaining('CustomError: Custom error message'),
      type: 'CustomError'
    })
  })

  test('returns value as-is for non-Error values', () => {
    expect(errorSerializer('string error')).toEqual('string error')
    expect(errorSerializer(123)).toEqual(123)
    expect(errorSerializer(null)).toEqual(null)
    expect(errorSerializer(undefined)).toEqual(undefined)
    expect(errorSerializer({ message: 'not an error' })).toEqual({
      message: 'not an error'
    })
  })

  test('preserves stack trace', () => {
    const error = new Error('Test error')
    const result = errorSerializer(error)

    expect(result.stack_trace).toBe(error.stack)
  })

  test('includes Boom error details in non-prod environment', () => {
    const boomError = new Error('Validation failed')
    boomError.isBoom = true
    boomError.output = {
      statusCode: 422,
      payload: {
        error: 'Unprocessable Entity',
        message: 'Validation failed: field is required',
        validation: { source: 'payload', keys: ['field'] }
      }
    }

    const result = errorSerializer(boomError)

    expect(result).toEqual({
      message: 'Validation failed',
      stack_trace: expect.stringContaining('Error: Validation failed'),
      type: 'Error',
      statusCode: 422,
      payload: {
        error: 'Unprocessable Entity',
        message: 'Validation failed: field is required',
        validation: { source: 'payload', keys: ['field'] }
      }
    })
  })
})

describe('loggerOptions.serializers.res', () => {
  const { res: resSerializer } = loggerOptions.serializers

  test('returns null/undefined as-is', () => {
    expect(resSerializer(null)).toBeNull()
    expect(resSerializer(undefined)).toBeUndefined()
  })

  test('returns statusCode for successful responses', () => {
    const res = { statusCode: 200 }
    const result = resSerializer(res)

    expect(result).toEqual({ statusCode: 200 })
  })

  test('includes error details for 4xx responses in non-prod', () => {
    const res = {
      statusCode: 422,
      source: {
        error: 'Unprocessable Entity',
        message: 'Invalid data',
        validation: { source: 'payload', keys: ['field'] }
      }
    }

    const result = resSerializer(res)

    expect(result).toEqual({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: 'Invalid data',
      validation: { source: 'payload', keys: ['field'] }
    })
  })

  test('includes error details for 5xx responses in non-prod', () => {
    const res = {
      statusCode: 500,
      source: {
        error: 'Internal Server Error',
        message: 'Something went wrong'
      }
    }

    const result = resSerializer(res)

    expect(result).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong'
    })
  })

  test('does not include error details for successful responses', () => {
    const res = {
      statusCode: 200,
      source: { data: 'some data' }
    }

    const result = resSerializer(res)

    expect(result).toEqual({ statusCode: 200 })
  })

  test('handles 4xx response without source', () => {
    const res = { statusCode: 404 }

    const result = resSerializer(res)

    expect(result).toEqual({ statusCode: 404 })
  })
})

describe('loggerOptions.serializers in production environment', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  test('excludes Boom error details in prod environment', async () => {
    vi.doMock('#root/config.js', () => ({
      config: {
        get: vi.fn((key) => {
          const values = {
            log: {
              isEnabled: true,
              level: 'info',
              format: 'ecs',
              redact: []
            },
            serviceName: 'test-service',
            serviceVersion: '1.0.0',
            cdpEnvironment: 'prod'
          }
          return values[key]
        })
      }
    }))

    const { loggerOptions: prodLoggerOptions } =
      await import('./logger-options.js')
    const { error: errorSerializer } = prodLoggerOptions.serializers

    const boomError = new Error('Validation failed')
    boomError.isBoom = true
    boomError.output = {
      statusCode: 422,
      payload: { error: 'Unprocessable Entity', message: 'Sensitive details' }
    }

    const result = errorSerializer(boomError)

    expect(result).toEqual({
      message: 'Validation failed',
      stack_trace: expect.stringContaining('Error: Validation failed'),
      type: 'Error'
    })
    expect(result.statusCode).toBeUndefined()
    expect(result.payload).toBeUndefined()
  })

  test('only returns statusCode for responses in prod environment', async () => {
    vi.doMock('#root/config.js', () => ({
      config: {
        get: vi.fn((key) => {
          const values = {
            log: {
              isEnabled: true,
              level: 'info',
              format: 'ecs',
              redact: []
            },
            serviceName: 'test-service',
            serviceVersion: '1.0.0',
            cdpEnvironment: 'prod'
          }
          return values[key]
        })
      }
    }))

    const { loggerOptions: prodLoggerOptions } =
      await import('./logger-options.js')
    const { res: resSerializer } = prodLoggerOptions.serializers

    const res = {
      statusCode: 422,
      source: {
        error: 'Unprocessable Entity',
        message: 'Sensitive validation details',
        validation: { source: 'payload', keys: ['password'] }
      }
    }

    const result = resSerializer(res)

    expect(result).toEqual({ statusCode: 422 })
    expect(result.error).toBeUndefined()
    expect(result.message).toBeUndefined()
    expect(result.validation).toBeUndefined()
  })
})
