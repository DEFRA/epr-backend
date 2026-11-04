import { calendarDate } from '#common/helpers/date-formatter.js'
import { dayAfter, dayBefore } from './calendar-day.js'

describe('calendar day shifts', () => {
  it('moves a date back across a month and year boundary', () => {
    expect(dayBefore(calendarDate('2026-03-01'))).toBe('2026-02-28')
    expect(dayBefore(calendarDate('2026-01-01'))).toBe('2025-12-31')
  })

  it('moves a date forward across a month and year boundary', () => {
    expect(dayAfter(calendarDate('2024-02-28'))).toBe('2024-02-29')
    expect(dayAfter(calendarDate('2026-12-31'))).toBe('2027-01-01')
  })
})
