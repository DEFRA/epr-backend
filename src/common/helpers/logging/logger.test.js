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
