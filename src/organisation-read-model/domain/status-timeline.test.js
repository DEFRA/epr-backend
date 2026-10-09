import { approvedYears, statusRanges } from './status-timeline.js'

const TODAY = '2028-03-15'

describe('statusRanges', () => {
  it('groups ranges by status, each ending the day before the next entry', () => {
    const timeline = {
      '2027-06-01': { status: 'approved' },
      '2025-02-01': { status: 'approved' },
      '2026-01-01': { status: 'cancelled' }
    }

    expect(statusRanges(timeline, TODAY)).toEqual({
      approved: [
        { from: '2025-02-01', to: '2025-12-31' },
        { from: '2027-06-01', to: TODAY }
      ],
      cancelled: [{ from: '2026-01-01', to: '2027-05-31' }]
    })
  })

  it('ignores entries after today', () => {
    const timeline = {
      '2028-03-15': { status: 'approved' },
      '2028-04-01': { status: 'cancelled' }
    }

    expect(statusRanges(timeline, TODAY)).toEqual({
      approved: [{ from: '2028-03-15', to: TODAY }]
    })
  })

  it('has no ranges for an empty timeline', () => {
    expect(statusRanges({}, TODAY)).toEqual({})
  })
})

describe('approvedYears', () => {
  it('lists every year from approval to today while it stays approved', () => {
    const timeline = { '2026-02-01': { status: 'approved' } }

    expect(approvedYears(timeline, TODAY)).toEqual([2026, 2027, 2028])
  })

  it('leaves out the year a cancellation starts on 1 January', () => {
    const timeline = {
      '2025-02-01': { status: 'approved' },
      '2026-01-01': { status: 'cancelled' }
    }

    expect(approvedYears(timeline, TODAY)).toEqual([2025])
  })

  it('skips the years between a cancellation and a reinstatement', () => {
    const timeline = {
      '2024-03-01': { status: 'approved' },
      '2025-01-01': { status: 'cancelled' },
      '2027-06-01': { status: 'approved' }
    }

    expect(approvedYears(timeline, TODAY)).toEqual([2024, 2027, 2028])
  })

  it('lists a year once when it holds more than one approved range', () => {
    const timeline = {
      '2025-02-01': { status: 'approved' },
      '2025-06-01': { status: 'cancelled' },
      '2025-09-01': { status: 'approved' }
    }

    expect(approvedYears(timeline, TODAY)).toEqual([2025, 2026, 2027, 2028])
  })

  it('lists nothing when never approved', () => {
    const timeline = { '2026-02-01': { status: 'cancelled' } }

    expect(approvedYears(timeline, TODAY)).toEqual([])
  })
})
