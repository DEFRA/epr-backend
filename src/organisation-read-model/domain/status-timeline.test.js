import { calendarDate } from '#common/helpers/date-formatter.js'
import {
  approvedYears,
  dailyTimeline,
  statusRanges
} from './status-timeline.js'

const TODAY = calendarDate('2028-03-15')

describe('dailyTimeline', () => {
  it('keeps the last status recorded on each UTC day', () => {
    const timeline = [
      { status: 'suspended', at: '2026-01-01T09:00:00.000Z' },
      { status: 'approved', at: '2026-01-01T12:00:00.000Z' },
      { status: 'cancelled', at: '2026-01-01T12:00:00.000Z' },
      { status: 'approved', at: '2026-02-01T00:00:00.000Z' }
    ]

    expect(dailyTimeline(timeline)).toEqual({
      '2026-01-01': { status: 'cancelled' },
      '2026-02-01': { status: 'approved' }
    })
  })

  it('has no days for an empty timeline', () => {
    expect(dailyTimeline([])).toEqual({})
  })
})

describe('statusRanges', () => {
  it('groups ranges by status, each ending the day before the next entry', () => {
    const timeline = [
      { status: 'approved', at: '2025-02-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2026-01-01T00:00:00.000Z' },
      { status: 'approved', at: '2027-06-01T00:00:00.000Z' }
    ]

    expect(statusRanges(timeline, TODAY)).toEqual({
      approved: [
        { from: '2025-02-01', to: '2025-12-31' },
        { from: '2027-06-01', to: TODAY }
      ],
      cancelled: [{ from: '2026-01-01', to: '2027-05-31' }]
    })
  })

  it('ignores entries after today', () => {
    const timeline = [
      { status: 'approved', at: '2028-03-15T00:00:00.000Z' },
      { status: 'cancelled', at: '2028-04-01T00:00:00.000Z' }
    ]

    expect(statusRanges(timeline, TODAY)).toEqual({
      approved: [{ from: '2028-03-15', to: TODAY }]
    })
  })

  it('has no ranges for an empty timeline', () => {
    expect(statusRanges([], TODAY)).toEqual({})
  })
})

describe('approvedYears', () => {
  it('lists every year from approval to today while it stays approved', () => {
    const timeline = [{ status: 'approved', at: '2026-02-01T00:00:00.000Z' }]

    expect(approvedYears(timeline, TODAY)).toEqual([2026, 2027, 2028])
  })

  it('leaves out the year a cancellation starts on 1 January', () => {
    const timeline = [
      { status: 'approved', at: '2025-02-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2026-01-01T00:00:00.000Z' }
    ]

    expect(approvedYears(timeline, TODAY)).toEqual([2025])
  })

  it('skips the years between a cancellation and a reinstatement', () => {
    const timeline = [
      { status: 'approved', at: '2024-03-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2025-01-01T00:00:00.000Z' },
      { status: 'approved', at: '2027-06-01T00:00:00.000Z' }
    ]

    expect(approvedYears(timeline, TODAY)).toEqual([2024, 2027, 2028])
  })

  it('lists a year once when it holds more than one approved range', () => {
    const timeline = [
      { status: 'approved', at: '2025-02-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2025-06-01T00:00:00.000Z' },
      { status: 'approved', at: '2025-09-01T00:00:00.000Z' }
    ]

    expect(approvedYears(timeline, TODAY)).toEqual([2025, 2026, 2027, 2028])
  })

  it('reads a day with several changes by its last one', () => {
    const timeline = [
      { status: 'approved', at: '2025-02-01T00:00:00.000Z' },
      { status: 'cancelled', at: '2026-01-01T09:00:00.000Z' },
      { status: 'approved', at: '2026-01-01T12:00:00.000Z' },
      { status: 'cancelled', at: '2026-01-01T15:00:00.000Z' }
    ]

    expect(approvedYears(timeline, TODAY)).toEqual([2025])
  })

  it('lists nothing when never approved', () => {
    const timeline = [{ status: 'cancelled', at: '2026-02-01T00:00:00.000Z' }]

    expect(approvedYears(timeline, TODAY)).toEqual([])
  })
})
