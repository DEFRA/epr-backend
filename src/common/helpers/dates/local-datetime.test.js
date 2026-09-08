import { formatLocalDateTime } from './local-datetime.js'

describe('#formatLocalDateTime', () => {
  it('formats a UTC instant as YYYY-MM-DDTHH:mm', () => {
    expect(
      formatLocalDateTime(new Date('2026-03-10T09:05:00.000Z'), 'UTC')
    ).toBe('2026-03-10T09:05')
  })

  it('resolves the given time zone, not UTC', () => {
    // 23:30 UTC on 30 June is 00:30 BST on 1 July.
    expect(
      formatLocalDateTime(new Date('2026-06-30T23:30:00.000Z'), 'Europe/London')
    ).toBe('2026-07-01T00:30')
  })

  it('resolves a GMT instant in Europe/London unchanged', () => {
    expect(
      formatLocalDateTime(new Date('2026-01-15T08:00:00.000Z'), 'Europe/London')
    ).toBe('2026-01-15T08:00')
  })
})
