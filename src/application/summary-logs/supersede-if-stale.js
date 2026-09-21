import {
  NO_PRIOR_SUBMISSION,
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import { summaryLogMetrics } from './metrics.js'

/** @import { SummaryLog } from '#domain/summary-logs/model.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */

/**
 * Compares the baseline a submitting summary log was validated against with the
 * registration's latest submitted log, and marks it superseded when they differ.
 *
 * @param {{
 *   summaryLogsRepository: SummaryLogsRepository,
 *   summaryLog: SummaryLog & { validatedAgainstSummaryLogId?: string },
 *   summaryLogId: string,
 *   organisationId: string,
 *   registrationId: string,
 *   version: number
 * }} params
 * @returns {Promise<boolean>} true when the log was stale and is now superseded
 */
export const supersedeIfStale = async ({
  summaryLogsRepository,
  summaryLog,
  summaryLogId,
  organisationId,
  registrationId,
  version
}) => {
  const currentLatest =
    await summaryLogsRepository.findLatestSubmittedForOrgReg(
      organisationId,
      registrationId
    )

  const baseline = summaryLog.validatedAgainstSummaryLogId
  const current = currentLatest?.id ?? NO_PRIOR_SUBMISSION

  if (baseline === current) {
    return false
  }

  await summaryLogsRepository.update(
    summaryLogId,
    version,
    transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUPERSEDED)
  )
  await summaryLogMetrics.recordStatusTransition({
    status: SUMMARY_LOG_STATUS.SUPERSEDED,
    processingType: summaryLog.meta?.[SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]
  })
  return true
}
