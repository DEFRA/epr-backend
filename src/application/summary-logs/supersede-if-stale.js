/** @import {SummaryLogId} from '#domain/summary-logs/ids.js' */
import Boom from '@hapi/boom'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  NO_PRIOR_SUBMISSION,
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { savedCommitOf } from '#domain/summary-logs/commit.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import { summaryLogKeyOf } from '#domain/summary-logs/numbers.js'
import { classificationContextOf } from '#waste-balances/application/read-model-accreditations.js'
import { hashClassificationContext } from './classification-context-hash.js'
import { summaryLogMetrics } from './metrics.js'
import { registrationForSummaryLog } from './registration-for-summary-log.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { SummaryLogCommit } from '#domain/summary-logs/commit.js' */
/** @import { SummaryLog } from '#domain/summary-logs/model.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SubmittedSummaryLog } from './validate-issue-logging.js' */

/**
 * Why a submitting summary log can no longer be committed as validated.
 */
export const SUPERSEDE_REASON = Object.freeze({
  NEWER_SUBMISSION: 'newer_submission',
  NO_COMMIT: 'no_commit',
  CONTEXT_CHANGED: 'context_changed'
})

/** @typedef {typeof SUPERSEDE_REASON[keyof typeof SUPERSEDE_REASON]} SupersedeReason */

/**
 * The answer to a submission `supersedeIfStale` turned away, carrying why.
 *
 * @param {SupersedeReason} reason
 */
export const staleSubmissionConflict = (reason) => {
  const boom = Boom.conflict(
    'This summary log can no longer be submitted as validated. Please re-upload.'
  )
  boom.output.payload.reason = reason
  return boom
}

/**
 * @typedef {{
 *   summaryLogsRepository: SummaryLogsRepository,
 *   organisationReadRepository: OrganisationReadRepository,
 *   logger: TypedLogger,
 *   summaryLog: SummaryLog,
 *   summaryLogId: SummaryLogId,
 *   version: number
 * }} SupersedeParams
 */

/**
 * @param {Pick<SupersedeParams, 'summaryLogsRepository' | 'organisationReadRepository' | 'summaryLog'>} params
 * @returns {Promise<{ reason: SupersedeReason, commit: null } | { reason: null, commit: SummaryLogCommit }>}
 */
const committableAs = async ({
  summaryLogsRepository,
  organisationReadRepository,
  summaryLog
}) => {
  const currentLatest = await summaryLogsRepository.findLatestSubmitted(
    summaryLogKeyOf(summaryLog)
  )
  if (
    summaryLog.validatedAgainstSummaryLogId !==
    (currentLatest?.id ?? NO_PRIOR_SUBMISSION)
  ) {
    return { reason: SUPERSEDE_REASON.NEWER_SUBMISSION, commit: null }
  }

  const commit = savedCommitOf(summaryLog)
  if (!commit) {
    return { reason: SUPERSEDE_REASON.NO_COMMIT, commit: null }
  }

  const registration = await registrationForSummaryLog(
    organisationReadRepository,
    /** @type {SubmittedSummaryLog} */ (summaryLog)
  )
  return hashClassificationContext(classificationContextOf(registration)) ===
    commit.contextHash
    ? { reason: null, commit }
    : { reason: SUPERSEDE_REASON.CONTEXT_CHANGED, commit: null }
}

/**
 * @param {SupersedeParams} params
 * @param {SupersedeReason} reason
 */
const supersede = async (
  { summaryLogsRepository, logger, summaryLog, summaryLogId, version },
  reason
) => {
  await summaryLogsRepository.update(
    summaryLogId,
    version,
    transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUPERSEDED)
  )
  await summaryLogMetrics.recordStatusTransition({
    status: SUMMARY_LOG_STATUS.SUPERSEDED,
    processingType: summaryLog.meta?.[SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE],
    reason
  })
  logger.warn({
    message: `Summary log superseded at submission: summaryLogId=${summaryLogId}, reason=${reason}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.SUMMARY_LOG_SUPERSEDED,
      reason
    }
  })
}

/**
 * Supersedes a submitting summary log that can no longer be committed as
 * validated, so the operator uploads it again; otherwise returns the commit
 * validation saved for it.
 *
 * @param {SupersedeParams} params
 * @returns {Promise<{ reason: SupersedeReason, commit: null } | { reason: null, commit: SummaryLogCommit }>}
 */
export const supersedeIfStale = async (params) => {
  const committable = await committableAs(params)
  if (committable.reason) {
    await supersede(params, committable.reason)
  }
  return committable
}
