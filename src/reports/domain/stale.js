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
 * Normalises a report's `stale` field to the current nested shape.
 * Upgrading the legacy flat shape (`{ uploadedAt, reason, summaryLogId }`) where needed.
 *
 * @param {any} stale
 * @returns {import('#reports/repository/port.js').ReportStale | undefined}
 */
export const normaliseStale = (stale) => {
  if (!stale) return undefined

  const { summaryLogChanged, prnCancelled, reason: _reason, ...rest } = stale

  // If we have either of the new structured fields, extract and return them
  if (summaryLogChanged || prnCancelled) {
    return {
      ...(summaryLogChanged && { summaryLogChanged }),
      ...(prnCancelled && { prnCancelled })
    }
  }

  // Fallback for the old flat shape (everything except 'reason' goes into summaryLogChanged)
  return { summaryLogChanged: rest }
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
