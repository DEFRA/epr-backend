import { monthKeyForDate, toYearMonth } from './year-month.js'

describe('toYearMonth', () => {
  it('slices the year-month from an ISO date string', () => {
    expect(toYearMonth('2026-03-01')).toBe('2026-03')
  })
})

describe('monthKeyForDate', () => {
  it.each([
    { description: 'null', value: null },
    { description: 'undefined', value: undefined },
    { description: 'an unparseable string', value: 'not-a-date' }
  ])('returns null for $description', ({ value }) => {
    expect(monthKeyForDate(value)).toBeNull()
  })

  it('returns the UTC month by default for a date-only string', () => {
    expect(monthKeyForDate('2026-03-10')).toBe('2026-03')
  })

  it('returns the UTC month for a Date object', () => {
    expect(monthKeyForDate(new Date('2026-11-20T12:00:00.000Z'))).toBe(
      '2026-11'
    )
  })

  it('honours an explicit UTC time zone', () => {
    expect(monthKeyForDate(new Date('2026-01-01T00:30:00.000Z'), 'UTC')).toBe(
      '2026-01'
    )
  })

  it('resolves the month in the given time zone at a month boundary', () => {
    // 23:30 UTC on 30 June is 00:30 BST on 1 July.
    expect(
      monthKeyForDate(new Date('2026-06-30T23:30:00.000Z'), 'Europe/London')
    ).toBe('2026-07')
  })
})
