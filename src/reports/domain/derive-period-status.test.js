import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { REPORT_STATUS } from './report-status.js'
import { PERIOD_STATUS } from './period-status.js'
import { derivePeriodStatus } from './derive-period-status.js'

/**
 * @import { ReportStatus } from './report-status.js'
 */

describe('#derivePeriodStatus', () => {
  beforeAll(() => {
    vi.useFakeTimers({
      now: new Date('2026-03-20T12:00:00Z'),
      toFake: ['Date']
    })
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  it.each(
    /** @type {Array<{ status: ReportStatus }>} */ ([
      { status: REPORT_STATUS.IN_PROGRESS },
      { status: REPORT_STATUS.READY_TO_SUBMIT },
      { status: REPORT_STATUS.SUBMITTED }
    ])
  )(
    'returns the persisted "$status" status even though the due date has passed',
    ({ status }) => {
      const report = { id: 'report-123', status }

      expect(
        derivePeriodStatus({
          endDate: '2026-01-31',
          dueDate: '2026-02-20',
          report
        })
      ).toBe(status)
    }
  )

  it('returns null when the period has not ended', () => {
    expect(
      derivePeriodStatus({
        endDate: '2026-03-31',
        dueDate: '2026-04-20',
        report: null
      })
    ).toBeNull()
  })

  it('returns "due" when the period has ended but the due date has not passed', () => {
    expect(
      derivePeriodStatus({
        endDate: '2026-02-28',
        dueDate: '2026-03-20',
        report: null
      })
    ).toBe(PERIOD_STATUS.DUE)
  })

  it('returns "overdue" when the due date has passed', () => {
    expect(
      derivePeriodStatus({
        endDate: '2025-12-31',
        dueDate: '2026-01-20',
        report: null
      })
    ).toBe(PERIOD_STATUS.OVERDUE)
  })

  describe('due-to-overdue boundary', () => {
    afterAll(() => {
      vi.setSystemTime(new Date('2026-03-20T12:00:00Z'))
    })

    it('returns "due" at 23:59 on the due date (the 20th)', () => {
      vi.setSystemTime(new Date('2026-02-20T23:59:59.999Z'))

      expect(
        derivePeriodStatus({
          endDate: '2026-01-31',
          dueDate: '2026-02-20',
          report: null
        })
      ).toBe(PERIOD_STATUS.DUE)
    })

    it('returns "overdue" at 00:00 on the 21st', () => {
      vi.setSystemTime(new Date('2026-02-21T00:00:00Z'))

      expect(
        derivePeriodStatus({
          endDate: '2026-01-31',
          dueDate: '2026-02-20',
          report: null
        })
      ).toBe(PERIOD_STATUS.OVERDUE)
    })
  })
})
