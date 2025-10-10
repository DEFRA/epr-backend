import { describe, test, expect } from 'vitest'
import { loggerOptions } from './logger-options.js'

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
})
