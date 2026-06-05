import Boom from '@hapi/boom'
import { REPORT_STATUS } from '#reports/domain/report-status.js'

export const STALE_REASON = Object.freeze({
  SUMMARY_LOG_CHANGED: 'summary_log_changed'
})

/**
 * @param {import('#reports/repository/port.js').Report} report
 */
/** @typedef {(typeof STALE_REASON)[keyof typeof STALE_REASON]} StaleReason */

export const assertNotStale = (report) => {
  if (report.stale && report.status.currentStatus !== REPORT_STATUS.SUBMITTED) {
    const err = Boom.conflict(
      'Report cannot be submitted: summary log has changed'
    )
    err.output.payload.code = report.stale.reason
    throw err
  }
}
