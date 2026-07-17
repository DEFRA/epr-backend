import Boom from '@hapi/boom'
import Joi from 'joi'
import { REPORT_STATUS } from '#reports/domain/report-status.js'

/**
 * @import { ReportStale, StaleSummaryLogChanged } from '#reports/repository/port.js'
 */

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
 * Normalises a report's `stale` field to the current nested shape
 * (`{ summaryLogChanged?, prnCancelled? }`), upgrading the legacy flat
 * shape (`{ uploadedAt, reason, summaryLogId }`) where needed.
 *
 * @param {Record<string, unknown> | undefined} stale
 * @returns {ReportStale | undefined}
 */
export const normaliseStale = (stale) => {
  if (!stale) {
    return undefined
  }

  const { summaryLogChanged, prnCancelled, reason: _reason, ...rest } = stale

  if (summaryLogChanged || prnCancelled) {
    return /** @type {ReportStale} */ ({
      ...(summaryLogChanged ? { summaryLogChanged } : {}),
      ...(prnCancelled ? { prnCancelled } : {})
    })
  }

  // Old flat shape: the only reason that existed before this change.
  return { summaryLogChanged: /** @type {StaleSummaryLogChanged} */ (rest) }
}

const KNOWN_STALE_KEYS = new Set(['summaryLogChanged', 'prnCancelled'])

/**
 * Lists the top-level `stale` keys that `normaliseStale` would drop: the legacy
 * flat fields left on a document written (or re-flagged) in the old shape. Empty
 * for a clean nested-shape `stale`. Lets the read boundary flag which documents
 * still carry the legacy shape so the migration tail is observable (PAE-1755).
 *
 * @param {Record<string, unknown> | undefined} stale
 * @returns {string[]}
 */
export const legacyStaleKeys = (stale) =>
  stale ? Object.keys(stale).filter((key) => !KNOWN_STALE_KEYS.has(key)) : []

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
