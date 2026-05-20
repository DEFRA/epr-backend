import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateComplianceReportingPeriods } from './compliance-reporting-periods.js'

describe('generateComplianceReportingPeriods', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns [] when no period has ended yet', () => {
    vi.setSystemTime(new Date('2026-01-15T00:00:00Z'))

    expect(generateComplianceReportingPeriods()).toEqual([])
  })

  it('returns Jan only when January has just ended', () => {
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'))

    expect(generateComplianceReportingPeriods()).toEqual([
      {
        key: '2026:monthly:1',
        cadence: 'monthly',
        year: 2026,
        period: 1,
        label: 'Jan Report',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        dueDate: '2026-02-20'
      }
    ])
  })

  it('returns monthly periods followed by Q1 when now is mid-April', () => {
    vi.setSystemTime(new Date('2025-04-15T00:00:00Z'))

    expect(generateComplianceReportingPeriods()).toEqual([
      {
        key: '2025:monthly:1',
        cadence: 'monthly',
        year: 2025,
        period: 1,
        label: 'Jan Report',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        dueDate: '2025-02-20'
      },
      {
        key: '2025:monthly:2',
        cadence: 'monthly',
        year: 2025,
        period: 2,
        label: 'Feb Report',
        startDate: '2025-02-01',
        endDate: '2025-02-28',
        dueDate: '2025-03-20'
      },
      {
        key: '2025:monthly:3',
        cadence: 'monthly',
        year: 2025,
        period: 3,
        label: 'Mar Report',
        startDate: '2025-03-01',
        endDate: '2025-03-31',
        dueDate: '2025-04-20'
      },
      {
        key: '2025:quarterly:1',
        cadence: 'quarterly',
        year: 2025,
        period: 1,
        label: 'Q1 Report',
        startDate: '2025-01-01',
        endDate: '2025-03-31',
        dueDate: '2025-04-20'
      }
    ])
  })

  it('returns ended periods through Q2 when now is mid-July', () => {
    vi.setSystemTime(new Date('2025-07-15T00:00:00Z'))

    expect(generateComplianceReportingPeriods()).toEqual([
      {
        key: '2025:monthly:1',
        cadence: 'monthly',
        year: 2025,
        period: 1,
        label: 'Jan Report',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        dueDate: '2025-02-20'
      },
      {
        key: '2025:monthly:2',
        cadence: 'monthly',
        year: 2025,
        period: 2,
        label: 'Feb Report',
        startDate: '2025-02-01',
        endDate: '2025-02-28',
        dueDate: '2025-03-20'
      },
      {
        key: '2025:monthly:3',
        cadence: 'monthly',
        year: 2025,
        period: 3,
        label: 'Mar Report',
        startDate: '2025-03-01',
        endDate: '2025-03-31',
        dueDate: '2025-04-20'
      },
      {
        key: '2025:quarterly:1',
        cadence: 'quarterly',
        year: 2025,
        period: 1,
        label: 'Q1 Report',
        startDate: '2025-01-01',
        endDate: '2025-03-31',
        dueDate: '2025-04-20'
      },
      {
        key: '2025:monthly:4',
        cadence: 'monthly',
        year: 2025,
        period: 4,
        label: 'Apr Report',
        startDate: '2025-04-01',
        endDate: '2025-04-30',
        dueDate: '2025-05-20'
      },
      {
        key: '2025:monthly:5',
        cadence: 'monthly',
        year: 2025,
        period: 5,
        label: 'May Report',
        startDate: '2025-05-01',
        endDate: '2025-05-31',
        dueDate: '2025-06-20'
      },
      {
        key: '2025:monthly:6',
        cadence: 'monthly',
        year: 2025,
        period: 6,
        label: 'Jun Report',
        startDate: '2025-06-01',
        endDate: '2025-06-30',
        dueDate: '2025-07-20'
      },
      {
        key: '2025:quarterly:2',
        cadence: 'quarterly',
        year: 2025,
        period: 2,
        label: 'Q2 Report',
        startDate: '2025-04-01',
        endDate: '2025-06-30',
        dueDate: '2025-07-20'
      }
    ])
  })
})
