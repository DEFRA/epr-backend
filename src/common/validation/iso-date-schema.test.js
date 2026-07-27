import { describe, expect, it } from 'vitest'
import { isoDateString } from './iso-date-schema.js'
import { expectValidationError } from './validation-test-helpers.js'

describe('#isoDateString', () => {
  it('accepts a real calendar date', () => {
    const { error, value } = isoDateString().validate('2026-08-01')

    expect(error).toBeUndefined()
    expect(value).toBe('2026-08-01')
  })

  it('accepts 29 February in a leap year', () => {
    const { error } = isoDateString().validate('2024-02-29')

    expect(error).toBeUndefined()
  })

  it('rejects a value that is not in YYYY-MM-DD format', () => {
    const [detail] = expectValidationError(isoDateString(), '01/08/2026')

    expect(detail.message).toBe('Date must be in YYYY-MM-DD format')
  })

  it('rejects a month outside 01-12', () => {
    const [detail] = expectValidationError(isoDateString(), '2026-13-01')

    expect(detail.message).toBe('Date must be in YYYY-MM-DD format')
  })

  it.each(['2026-02-30', '2026-04-31', '2025-02-29'])(
    'rejects %s, a day that does not exist in that month',
    (value) => {
      const [detail] = expectValidationError(isoDateString(), value)

      expect(detail.message).toBe('Date must be in YYYY-MM-DD format')
    }
  )
})
