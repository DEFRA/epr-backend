import { describe, test, expect, vi, beforeEach } from 'vitest'
import { loggerOptions } from './logger-options.js'

// vi.mock is hoisted by vitest, so this runs before the import above
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
        'featureFlags.allowSensitiveLogs': true // allow sensitive logs by default in tests
      }
      return values[key]
    })
  }
}))

describe('loggerOptions.serializers.err', () => {
  const { err: errorSerializer } = loggerOptions.serializers

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

  test('includes Boom error details when allowSensitiveLogs is enabled', () => {
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

  test('enhances message with Boom data details when allowSensitiveLogs is enabled', () => {
    const boomError = new Error('Unauthorized')
    boomError.isBoom = true
    boomError.output = {
      statusCode: 401,
      payload: {
        error: 'Unauthorized',
        message: 'Unauthorized'
      }
    }
    boomError.data = {
      reason: 'Token issuer not recognised',
      issuer: 'https://unknown-issuer.example.com'
    }

    const result = errorSerializer(boomError)

    expect(result.message).toContain('Unauthorized')
    expect(result.message).toContain('Token issuer not recognised')
  })

  test('falls back to [unserializable] when Boom data has circular references', () => {
    const circular = {}
    circular.self = circular

    const boomError = new Error('JWKS endpoint error')
    boomError.isBoom = true
    boomError.output = {
      statusCode: 502,
      payload: { error: 'Bad Gateway', message: 'JWKS endpoint error' }
    }
    boomError.data = circular

    const result = errorSerializer(boomError)

    expect(result.message).toBe('JWKS endpoint error | data: [unserializable]')
  })
})

describe('loggerOptions.serializers.err with cause', () => {
  const { err: errorSerializer } = loggerOptions.serializers

  test('surfaces bounded classifiers (type and code) from err.cause', () => {
    const originalError = new Error(
      'connect ECONNREFUSED 127.0.0.1:27017 — possibly leaky detail'
    )
    originalError.code = 'ECONNREFUSED'

    const boomError = new Error('Failed to fetch from url: http://example.com')
    boomError.isBoom = true
    boomError.output = { statusCode: 500, payload: {} }
    boomError.cause = originalError

    const result = errorSerializer(boomError)

    expect(result.cause).toEqual({ type: 'Error', code: 'ECONNREFUSED' })
  })

  test('does not surface cause.message or cause.stack (PII safety)', () => {
    const originalError = new Error(
      'leaky content: alice@example.com and tokens'
    )
    originalError.code = 'SOMETHING'

    const boomError = new Error('clean boom message')
    boomError.isBoom = true
    boomError.output = { statusCode: 500, payload: {} }
    boomError.cause = originalError

    const result = errorSerializer(boomError)

    expect(result.cause).not.toHaveProperty('message')
    expect(result.cause).not.toHaveProperty('stack')
    expect(result.cause).not.toHaveProperty('stack_trace')
    expect(JSON.stringify(result.cause)).not.toContain('alice@example.com')
  })

  test('omits cause field when the error has no cause', () => {
    const boomError = new Error('no cause here')
    boomError.isBoom = true
    boomError.output = { statusCode: 500, payload: {} }

    const result = errorSerializer(boomError)

    expect(result).not.toHaveProperty('cause')
  })

  test('omits cause field when the cause is not an Error instance', () => {
    const boomError = new Error('weird cause')
    boomError.isBoom = true
    boomError.output = { statusCode: 500, payload: {} }
    boomError.cause = 'a string, not an Error'

    const result = errorSerializer(boomError)

    expect(result).not.toHaveProperty('cause')
  })

  test('surfaces cause classifiers for non-Boom errors too', () => {
    const originalError = new Error('original leaky content')
    originalError.code = 'ENOENT'

    const wrappingError = new Error('wrapper message', {
      cause: originalError
    })

    const result = errorSerializer(wrappingError)

    expect(result.cause).toEqual({ type: 'Error', code: 'ENOENT' })
  })
})

describe('loggerOptions.serializers.res', () => {
  const { res: resSerializer } = loggerOptions.serializers

  test('returns null/undefined as-is', () => {
    expect(resSerializer(null)).toBeNull()
    expect(resSerializer(undefined)).toBeUndefined()
  })

  test('returns only statusCode for responses', () => {
    // Note: res serializer only returns statusCode because hapi-pino passes
    // request.raw.res (Node's raw response), not Hapi's response with source.
    // Error details for 4xx are logged via log4xxResponseErrors option instead.
    const res = { statusCode: 200 }
    const result = resSerializer(res)

    expect(result).toEqual({ statusCode: 200 })
  })

  test('returns only statusCode for error responses', () => {
    const res = { statusCode: 422 }
    const result = resSerializer(res)

    expect(result).toEqual({ statusCode: 422 })
  })
})

describe('loggerOptions.log4xxResponseErrors', () => {
  test('is enabled when allowSensitiveLogs feature flag is on', () => {
    expect(loggerOptions.log4xxResponseErrors).toBe(true)
  })
})

describe('loggerOptions when allowSensitiveLogs feature flag is off', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  test('excludes Boom error details', async () => {
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
            'featureFlags.allowSensitiveLogs': false
          }
          return values[key]
        })
      }
    }))

    const { loggerOptions: restrictedLoggerOptions } =
      await import('./logger-options.js')
    const { err: errorSerializer } = restrictedLoggerOptions.serializers

    const boomError = new Error('Validation failed')
    boomError.isBoom = true
    boomError.output = {
      statusCode: 422,
      payload: { error: 'Unprocessable Entity', message: 'Sensitive details' }
    }
    boomError.data = { sensitiveInfo: 'should not appear' }

    const result = errorSerializer(boomError)

    expect(result).toEqual({
      message: 'Validation failed',
      stack_trace: expect.stringContaining('Error: Validation failed'),
      type: 'Error'
    })
    expect(result.statusCode).toBeUndefined()
    expect(result.payload).toBeUndefined()
    expect(result.message).not.toContain('sensitiveInfo')
  })

  test('log4xxResponseErrors is disabled', async () => {
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
            'featureFlags.allowSensitiveLogs': false
          }
          return values[key]
        })
      }
    }))

    const { loggerOptions: restrictedLoggerOptions } =
      await import('./logger-options.js')

    expect(restrictedLoggerOptions.log4xxResponseErrors).toBe(false)
  })
})
