import { describe, expect, it } from 'vitest'
import {
  assertNotStale,
  assertValidStaleReasonsCode,
  legacyStaleKeys,
  normaliseStale,
  STALE_REASON,
  staleReasons
} from './stale.js'
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

const buildSummaryLogChanged = (overrides = {}) => ({
  uploadedAt: '2025-01-01T00:00:00.000Z',
  summaryLogId: 'sl-1',
  ...overrides
})

const buildPrnCancelled = (overrides = {}) => ({
  occurredAt: '2025-01-01T00:00:00.000Z',
  prnId: 'prn-1',
  ...overrides
})

describe('STALE_REASON', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(STALE_REASON)).toBe(true)
  })

  it('contains SUMMARY_LOG_CHANGED value', () => {
    expect(STALE_REASON.SUMMARY_LOG_CHANGED).toBe('summary_log_changed')
  })

  it('contains PRN_CANCELLED value', () => {
    expect(STALE_REASON.PRN_CANCELLED).toBe('prn_cancelled')
  })
})

describe('staleReasons', () => {
  it('returns [] for undefined stale', () => {
    expect(staleReasons(undefined)).toEqual([])
  })

  it('returns [] for an empty stale object', () => {
    expect(staleReasons({})).toEqual([])
  })

  it('returns [summary_log_changed] when only summaryLogChanged is set', () => {
    expect(
      staleReasons({ summaryLogChanged: buildSummaryLogChanged() })
    ).toEqual([STALE_REASON.SUMMARY_LOG_CHANGED])
  })

  it('returns [prn_cancelled] when only prnCancelled is set', () => {
    expect(staleReasons({ prnCancelled: buildPrnCancelled() })).toEqual([
      STALE_REASON.PRN_CANCELLED
    ])
  })

  it('returns both reasons when both fields are set', () => {
    expect(
      staleReasons({
        summaryLogChanged: buildSummaryLogChanged(),
        prnCancelled: buildPrnCancelled()
      })
    ).toEqual([STALE_REASON.SUMMARY_LOG_CHANGED, STALE_REASON.PRN_CANCELLED])
  })
})

describe('normaliseStale', () => {
  it('returns undefined for undefined input', () => {
    expect(normaliseStale(undefined)).toBeUndefined()
  })

  it('passes through the current nested shape unchanged', () => {
    const stale = { summaryLogChanged: buildSummaryLogChanged() }
    expect(normaliseStale(stale)).toEqual(stale)
  })

  it('upgrades the old flat shape to summaryLogChanged', () => {
    const flat = {
      uploadedAt: '2025-01-01T00:00:00.000Z',
      reason: 'summary_log_changed',
      summaryLogId: 'sl-1'
    }

    expect(normaliseStale(flat)).toEqual({
      summaryLogChanged: {
        uploadedAt: '2025-01-01T00:00:00.000Z',
        summaryLogId: 'sl-1'
      }
    })
  })

  it('strips legacy flat siblings left behind by a dot-path $set onto an old-shape document', () => {
    // A doc first written in the old flat shape, then later `$set` with a
    // dot-path (e.g. `stale.summaryLogChanged`) merges rather than replaces,
    // leaving the legacy top-level keys alongside the new nested key.
    const mixed = {
      uploadedAt: '2025-01-01T00:00:00.000Z',
      reason: 'summary_log_changed',
      summaryLogId: 'sl-1',
      summaryLogChanged: {
        uploadedAt: '2025-02-01T00:00:00.000Z',
        summaryLogId: 'sl-2'
      }
    }

    expect(normaliseStale(mixed)).toEqual({
      summaryLogChanged: {
        uploadedAt: '2025-02-01T00:00:00.000Z',
        summaryLogId: 'sl-2'
      }
    })
  })

  it('strips legacy flat siblings alongside a nested prnCancelled key', () => {
    const mixed = {
      uploadedAt: '2025-01-01T00:00:00.000Z',
      reason: 'summary_log_changed',
      summaryLogId: 'sl-1',
      prnCancelled: buildPrnCancelled()
    }

    expect(normaliseStale(mixed)).toEqual({
      prnCancelled: buildPrnCancelled()
    })
  })

  it('preserves both reasons when both nested keys are present alongside legacy siblings', () => {
    const mixed = {
      uploadedAt: '2025-01-01T00:00:00.000Z',
      reason: 'summary_log_changed',
      summaryLogId: 'sl-1',
      summaryLogChanged: buildSummaryLogChanged(),
      prnCancelled: buildPrnCancelled()
    }

    expect(normaliseStale(mixed)).toEqual({
      summaryLogChanged: buildSummaryLogChanged(),
      prnCancelled: buildPrnCancelled()
    })
  })
})

describe('legacyStaleKeys', () => {
  it('returns [] for undefined', () => {
    expect(legacyStaleKeys(undefined)).toEqual([])
  })

  it('returns [] for the current nested shape', () => {
    expect(
      legacyStaleKeys({
        summaryLogChanged: buildSummaryLogChanged(),
        prnCancelled: buildPrnCancelled()
      })
    ).toEqual([])
  })

  it('returns every flat key for the old flat shape', () => {
    expect(
      legacyStaleKeys({
        uploadedAt: '2025-01-01T00:00:00.000Z',
        reason: 'summary_log_changed',
        summaryLogId: 'sl-1'
      })
    ).toEqual(['uploadedAt', 'reason', 'summaryLogId'])
  })

  it('returns only the stray siblings for a hybrid shape', () => {
    expect(
      legacyStaleKeys({
        uploadedAt: '2025-01-01T00:00:00.000Z',
        reason: 'summary_log_changed',
        summaryLogId: 'sl-1',
        summaryLogChanged: buildSummaryLogChanged()
      })
    ).toEqual(['uploadedAt', 'reason', 'summaryLogId'])
  })
})

describe('assertNotStale', () => {
  it('does not throw when report has no stale field', () => {
    expect(() => assertNotStale(buildReport())).not.toThrow()
  })

  it('does not throw when stale is an empty object', () => {
    expect(() => assertNotStale(buildReport({ stale: {} }))).not.toThrow()
  })

  it('throws 409 with [summary_log_changed] as code for an in_progress stale report', () => {
    const report = buildReport({
      stale: { summaryLogChanged: buildSummaryLogChanged() }
    })

    expect(() => assertNotStale(report)).toThrow(
      expect.objectContaining({
        isBoom: true,
        output: expect.objectContaining({
          statusCode: 409,
          payload: expect.objectContaining({
            code: [STALE_REASON.SUMMARY_LOG_CHANGED]
          })
        })
      })
    )
  })

  it('throws 409 with [prn_cancelled] as code when only prnCancelled is set', () => {
    const report = buildReport({
      stale: { prnCancelled: buildPrnCancelled() }
    })

    expect(() => assertNotStale(report)).toThrow(
      expect.objectContaining({
        isBoom: true,
        output: expect.objectContaining({
          statusCode: 409,
          payload: expect.objectContaining({
            code: [STALE_REASON.PRN_CANCELLED]
          })
        })
      })
    )
  })

  it('throws 409 with both codes when both reasons are set', () => {
    const report = buildReport({
      stale: {
        summaryLogChanged: buildSummaryLogChanged(),
        prnCancelled: buildPrnCancelled()
      }
    })

    expect(() => assertNotStale(report)).toThrow(
      expect.objectContaining({
        isBoom: true,
        output: expect.objectContaining({
          payload: expect.objectContaining({
            code: [STALE_REASON.SUMMARY_LOG_CHANGED, STALE_REASON.PRN_CANCELLED]
          })
        })
      })
    )
  })

  it('throws 409 for a ready_to_submit stale report', () => {
    const report = buildReport({
      status: { currentStatus: REPORT_STATUS.READY_TO_SUBMIT },
      stale: { summaryLogChanged: buildSummaryLogChanged() }
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
      stale: { summaryLogChanged: buildSummaryLogChanged() }
    })

    expect(() => assertNotStale(report)).not.toThrow()
  })
})

describe('assertValidStaleReasonsCode', () => {
  it('does not throw for a valid non-empty array of known reasons', () => {
    expect(() =>
      assertValidStaleReasonsCode([STALE_REASON.SUMMARY_LOG_CHANGED])
    ).not.toThrow()
  })

  it('throws 500 for an empty array', () => {
    expect(() => assertValidStaleReasonsCode([])).toThrow(
      expect.objectContaining({
        isBoom: true,
        output: expect.objectContaining({ statusCode: 500 })
      })
    )
  })

  it('throws 500 for an unrecognised reason code', () => {
    expect(() => assertValidStaleReasonsCode(['not_a_known_reason'])).toThrow(
      expect.objectContaining({
        isBoom: true,
        output: expect.objectContaining({ statusCode: 500 })
      })
    )
  })
})
