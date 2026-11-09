import { describe, expect, it } from 'vitest'
import { isoDateTimeString } from './iso-date-time-schema.js'
import { expectValidationError } from './validation-test-helpers.js'

describe('#isoDateTimeString', () => {
  it('accepts a UTC date-time with milliseconds', () => {
    const { error, value } = isoDateTimeString().validate(
      '2027-01-01T09:30:00.000Z'
    )

    expect(error).toBeUndefined()
    expect(value).toBe('2027-01-01T09:30:00.000Z')
  })

  it.each([
    '2027-01-01T09:30:00Z',
    '2027-01-01',
    '2027-01-01T10:30:00.000+01:00',
    '2027',
    'not a date',
    '2027-13-01T00:00:00.000Z'
  ])('rejects %s, which is not a UTC date-time with milliseconds', (value) => {
    const [detail] = expectValidationError(isoDateTimeString(), value)

    expect(detail.message).toBe(
      'Date-time must be in YYYY-MM-DDTHH:mm:ss.sssZ format'
    )
  })

  it('declares its format as a pattern, so the API docs show it', () => {
    const { rules } = isoDateTimeString().describe()

    expect(rules).toContainEqual(expect.objectContaining({ name: 'pattern' }))
  })

  it('rejects 30 February', () => {
    const [detail] = expectValidationError(
      isoDateTimeString(),
      '2027-02-30T00:00:00.000Z'
    )

    expect(detail.message).toBe(
      'Date-time must be in YYYY-MM-DDTHH:mm:ss.sssZ format'
    )
  })
})
