import { describe, test, expect } from 'vitest'
import { formatError } from './format-error.js'

describe('formatError', () => {
  test('formats Error instance correctly', () => {
    const error = new Error('Something went wrong')
    const result = formatError(error)

    expect(result).toEqual({
      error: {
        message: 'Something went wrong',
        stack_trace: expect.stringContaining('Error: Something went wrong'),
        type: 'Error'
      }
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
    const result = formatError(error)

    expect(result).toEqual({
      error: {
        message: 'Custom error message',
        stack_trace: expect.stringContaining(
          'CustomError: Custom error message'
        ),
        type: 'CustomError'
      }
    })
  })

  test('returns empty object for non-Error values', () => {
    expect(formatError('string error')).toEqual({})
    expect(formatError(123)).toEqual({})
    expect(formatError(null)).toEqual({})
    expect(formatError(undefined)).toEqual({})
    expect(formatError({ message: 'not an error' })).toEqual({})
  })

  test('preserves stack trace', () => {
    const error = new Error('Test error')
    const result = formatError(error)

    expect(result.error.stack_trace).toBe(error.stack)
  })
})
