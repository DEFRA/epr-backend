import { describe, expect, it } from 'vitest'
import { assertNotStale, STALE_REASON } from './stale.js'
import { REPORT_STATUS } from './report-status.js'

/**
 * @import { Report } from '#reports/repository/port.js'
 */

/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Report}
 */
const buildReport = (overrides = {}) =>
  /** @type {Report} */ (
    /** @type {unknown} */ ({
      id: 'report-1',
      version: 1,
      status: { currentStatus: REPORT_STATUS.IN_PROGRESS },
      ...overrides
    })
  )

const buildStale = (overrides = {}) => ({
  uploadedAt: '2025-01-01T00:00:00.000Z',
  reason: STALE_REASON.SUMMARY_LOG_CHANGED,
  ...overrides
})

describe('STALE_REASON', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(STALE_REASON)).toBe(true)
  })

  it('contains SUMMARY_LOG_CHANGED value', () => {
    expect(STALE_REASON.SUMMARY_LOG_CHANGED).toBe('summary_log_changed')
  })
})

describe('assertNotStale', () => {
  it('does not throw when report has no stale field', () => {
    expect(() => assertNotStale(buildReport())).not.toThrow()
  })

  it('throws 409 with stale reason as code for an in_progress stale report', () => {
    const report = buildReport({ stale: buildStale() })

    expect(() => assertNotStale(report)).toThrow(
      expect.objectContaining({
        isBoom: true,
        output: expect.objectContaining({
          statusCode: 409,
          payload: expect.objectContaining({
            code: STALE_REASON.SUMMARY_LOG_CHANGED
          })
        })
      })
    )
  })

  it('throws 409 for a ready_to_submit stale report', () => {
    const report = buildReport({
      status: { currentStatus: REPORT_STATUS.READY_TO_SUBMIT },
      stale: buildStale()
    })

    expect(() => assertNotStale(report)).toThrow(
      expect.objectContaining({
        isBoom: true,
        output: expect.objectContaining({ statusCode: 409 })
      })
    )
  })

  it('does not throw for a submitted report even when stale is set', () => {
    const report = buildReport({
      status: { currentStatus: REPORT_STATUS.SUBMITTED },
      stale: buildStale()
    })

    expect(() => assertNotStale(report)).not.toThrow()
  })
})
