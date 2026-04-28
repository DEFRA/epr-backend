import { describe, test, expect, vi } from 'vitest'
import { loggerOptions } from './logger-options.js'

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
        serviceVersion: '1.0.0'
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

  test('passes through err.code as error.code', () => {
    const error = new Error('classified failure')
    error.code = 'SOMETHING_WRONG'

    const result = errorSerializer(error)

    expect(result).toEqual({
      message: 'classified failure',
      stack_trace: expect.any(String),
      type: 'Error',
      code: 'SOMETHING_WRONG'
    })
  })

  test('omits code when err.code is not set', () => {
    const error = new Error('no code here')

    const result = errorSerializer(error)

    expect(result).not.toHaveProperty('code')
  })
})

describe('loggerOptions.serializers.res', () => {
  const { res: resSerializer } = loggerOptions.serializers

  test('returns null/undefined as-is', () => {
    expect(resSerializer(null)).toBeNull()
    expect(resSerializer(undefined)).toBeUndefined()
  })

  test('returns only statusCode for responses', () => {
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
