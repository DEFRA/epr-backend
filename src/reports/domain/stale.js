import Boom from '@hapi/boom'
import Joi from 'joi'
import { REPORT_STATUS } from '#reports/domain/report-status.js'

export const STALE_REASON = Object.freeze({
  SUMMARY_LOG_CHANGED: 'summary_log_changed',
  PRN_CANCELLED: 'prn_cancelled'
})

/**
 * Contract for the 409 payload's `code` field: a non-empty array of known
 * stale reasons. Asserted just before assignment so the shape `staleReasons`
 * produces is verified, not just assumed by callers that read `err.output.payload.code`.
 */
const staleReasonsCodeSchema = Joi.array()
  .items(Joi.string().valid(...Object.values(STALE_REASON)))
  .min(1)
  .required()

/** @typedef {(typeof STALE_REASON)[keyof typeof STALE_REASON]} StaleReason */

/**
 * Derives which stale reasons apply from the named fields present on `stale`.
 * A report can be stale for both reasons at once (a summary log was
 * re-uploaded and a PRN it relied on was cancelled), so this returns a set,
 * not a single winning reason.
 *
 * @param {import('#reports/repository/port.js').ReportStale | undefined} stale
 * @returns {StaleReason[]}
 */
export const staleReasons = (stale) => {
  if (!stale) {
    return []
  }
  /** @type {StaleReason[]} */
  const reasons = []
  if (stale.summaryLogChanged) {
    reasons.push(STALE_REASON.SUMMARY_LOG_CHANGED)
  }
  if (stale.prnCancelled) {
    reasons.push(STALE_REASON.PRN_CANCELLED)
  }
  return reasons
}

/**
 * Normalises a report's `stale` field to the current nested shape. Old
 * documents (written before the PRN-cancellation trigger existed) carry a
 * flat `{ uploadedAt, reason, summaryLogId }` object; new writes only ever
 * produce `{ summaryLogChanged?, prnCancelled? }`. Applied at the repository
 * read boundary so every caller sees the current shape regardless of when
 * the document was written — no bulk migration needed, since `stale` only
 * ever applies to active drafts, which are short-lived by construction.
 *
 * @param {Record<string, unknown> | undefined} stale
 * @returns {import('#reports/repository/port.js').ReportStale | undefined}
 */
export const normaliseStale = (stale) => {
  if (!stale) {
    return undefined
  }
  if ('summaryLogChanged' in stale || 'prnCancelled' in stale) {
    return /** @type {import('#reports/repository/port.js').ReportStale} */ (
      stale
    )
  }
  // Old flat shape: the only reason that existed before this change.
  const { reason: _reason, ...rest } = stale
  return {
    summaryLogChanged:
      /** @type {import('#reports/repository/port.js').StaleSummaryLogChanged} */ (
        rest
      )
  }
}

/**
 * Asserts `reasons` matches the 409 payload's `code` contract, so the shape
 * `staleReasons` produces is verified rather than just assumed by callers
 * that read `err.output.payload.code`. Exported standalone so the failure
 * branch is directly testable without needing `staleReasons` itself to ever
 * produce an invalid array.
 *
 * @param {string[]} reasons
 */
export const assertValidStaleReasonsCode = (reasons) => {
  const { error } = staleReasonsCodeSchema.validate(reasons)
  if (error) {
    throw Boom.badImplementation(
      `Invalid stale reasons payload: ${error.message}`
    )
  }
}

/**
 * @param {import('#reports/repository/port.js').Report} report
 */
export const assertNotStale = (report) => {
  const reasons = staleReasons(report.stale)
  if (
    reasons.length > 0 &&
    report.status.currentStatus !== REPORT_STATUS.SUBMITTED
  ) {
    assertValidStaleReasonsCode(reasons)

    const err = Boom.conflict(
      'Report cannot be submitted: summary log has changed or a PRN was cancelled'
    )
    err.output.payload.code = reasons
    throw err
  }
}
