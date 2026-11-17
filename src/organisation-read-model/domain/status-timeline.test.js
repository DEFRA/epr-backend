import { toYear } from '#common/helpers/dates/year.js'
import { calendarDate } from '#common/helpers/date-formatter.js'
import { approvedBy, approvedYears } from './status-timeline.js'

const UP_TO_2028 = toYear(2028)

describe('approvedYears', () => {
  it('lists every year from approval up to the year given while it stays approved', () => {
    const timeline = [{ status: 'approved', at: '2026-02-01T00:00:00.000Z' }]

    expect(approvedYears(timeline, UP_TO_2028)).toEqual([2026, 2027, 2028])
  })

  it('leaves out the year a cancellation starts on 1 January', () => {
    const timeline = [
      { status: 'approved', at: '2025-02-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2026-01-01T00:00:00.000Z' }
    ]

    expect(approvedYears(timeline, UP_TO_2028)).toEqual([2025])
  })

  it('skips the years between a cancellation and a reinstatement', () => {
    const timeline = [
      { status: 'approved', at: '2024-03-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2025-01-01T00:00:00.000Z' },
      { status: 'approved', at: '2027-06-01T00:00:00.000Z' }
    ]

    expect(approvedYears(timeline, UP_TO_2028)).toEqual([2024, 2027, 2028])
  })

  it('lists a year once when it holds more than one approved range', () => {
    const timeline = [
      { status: 'approved', at: '2025-02-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2025-06-01T00:00:00.000Z' },
      { status: 'approved', at: '2025-09-01T00:00:00.000Z' }
    ]

    expect(approvedYears(timeline, UP_TO_2028)).toEqual([
      2025, 2026, 2027, 2028
    ])
  })

  it('reads a day with several changes by its last one', () => {
    const timeline = [
      { status: 'approved', at: '2025-02-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2026-01-01T09:00:00.000Z' },
      { status: 'approved', at: '2026-01-01T12:00:00.000Z' },
      { status: 'cancelled', at: '2026-01-01T15:00:00.000Z' }
    ]

    expect(approvedYears(timeline, UP_TO_2028)).toEqual([2025])
  })

  it('ignores changes after the year given', () => {
    const timeline = [
      { status: 'approved', at: '2027-02-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2028-01-01T00:00:00.000Z' },
      { status: 'approved', at: '2029-06-01T00:00:00.000Z' }
    ]

    expect(approvedYears(timeline, UP_TO_2028)).toEqual([2027])
  })

  it('ignores an approval after the year given', () => {
    const timeline = [{ status: 'approved', at: '2029-01-01T00:00:00.000Z' }]

    expect(approvedYears(timeline, UP_TO_2028)).toEqual([])
  })

  it('lists nothing when never approved', () => {
    const timeline = [{ status: 'cancelled', at: '2026-02-01T00:00:00.000Z' }]

    expect(approvedYears(timeline, UP_TO_2028)).toEqual([])
  })
})

describe('approvedBy', () => {
  const JUNE_1ST_2026 = calendarDate('2026-06-01')

  it('is true once an approval has taken effect', () => {
    const timeline = [{ status: 'approved', at: '2026-06-01T09:00:00.000Z' }]

    expect(approvedBy(timeline, JUNE_1ST_2026)).toBe(true)
  })

  it('is false before the approval takes effect', () => {
    const timeline = [{ status: 'approved', at: '2026-06-02T00:00:00.000Z' }]

    expect(approvedBy(timeline, JUNE_1ST_2026)).toBe(false)
  })

  it('does not count an approval cancelled the same day', () => {
    const timeline = [
      { status: 'approved', at: '2026-06-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2026-06-01T00:00:00.000Z' }
    ]

    expect(approvedBy(timeline, JUNE_1ST_2026)).toBe(false)
  })
})
