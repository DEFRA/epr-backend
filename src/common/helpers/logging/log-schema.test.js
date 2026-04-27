import { describe, it, expect } from 'vitest'
import { logSchema } from './log-schema.js'

describe('logSchema', () => {
  it('should accept a minimal log with message only', () => {
    const { error } = logSchema.validate({ message: 'hello' })

    expect(error).toBeUndefined()
  })

  it('should accept a log with indexed nested error and event fields', () => {
    const { error } = logSchema.validate({
      message: 'something failed',
      error: { code: 'cadence_mismatch', message: 'oops' },
      event: { category: 'http', action: 'create_report' },
      http: { response: { status_code: 400 } }
    })

    expect(error).toBeUndefined()
  })

  it('should reject a top-level key that is not in the CDP allowlist', () => {
    const { error } = logSchema.validate({
      message: 'hi',
      somethingNotIndexed: 'x'
    })

    expect(error).toBeDefined()
    expect(error?.message).toMatch(/somethingNotIndexed/)
  })

  it('should reject a nested key that is not in the CDP allowlist', () => {
    const { error } = logSchema.validate({
      message: 'hi',
      error: { code: 'X', notAllowed: 'y' }
    })

    expect(error).toBeDefined()
    expect(error?.message).toMatch(/notAllowed/)
  })

  it('should reject a wrong type for an indexed field', () => {
    const { error } = logSchema.validate({
      message: 'hi',
      http: { response: { status_code: 'four-hundred' } }
    })

    expect(error).toBeDefined()
    expect(error?.message).toMatch(/status_code/)
  })
})
