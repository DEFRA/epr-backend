import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES,
  VALIDATION_SEVERITY
} from '#common/enums/index.js'
import { LOCATION_KEYS } from '#common/validation/validation-issues.js'

export const MAX_VALIDATION_ISSUES = 100

/** @import {IndexedLogProperties, TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {ValidationIssue, ValidationIssueContext, ValidationIssueCounts, ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {StoredFile, SummaryLog} from '#domain/summary-logs/model.js' */

/**
 * SummaryLog after the validator has confirmed it's past PREPROCESSING. The
 * base typedef leaves org/reg/accreditation optional and admits the pending
 * file shape to cover PREPROCESSING; this narrows them to the guarantees
 * upstream business logic provides by the VALIDATING state.
 *
 * @typedef {SummaryLog & {
 *   organisationId: string,
 *   registrationId: string,
 *   accreditationId?: string,
 *   file: StoredFile
 * }} SubmittedSummaryLog
 */

/**
 * @param {ValidationIssueContext} [context]
 * @returns {string} Semicolon-delimited composite, empty parts omitted
 */
const buildLocationId = (context) => {
  const location = context?.location
  if (!location) {
    return ''
  }
  return LOCATION_KEYS.filter((key) => location[key] !== undefined)
    .map((key) => `${key}=${location[key]}`)
    .join(';')
}

/**
 * @param {ValidationIssue} issue
 * @param {string} summaryLogId
 * @returns {IndexedLogProperties}
 */
const buildIssueLogPayload = (issue, summaryLogId) => {
  const id = buildLocationId(issue.context)
  return {
    message: `Summary log validation issue: ${issue.code}`,
    event: {
      kind: 'event',
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.SUMMARY_LOG_VALIDATION_ISSUE,
      outcome: 'failure',
      type: 'error',
      reference: summaryLogId,
      reason: issue.code
    },
    error: {
      code: issue.code,
      type: issue.severity,
      message: issue.message,
      ...(id && { id })
    }
  }
}

/**
 * @param {{
 *   counts: ValidationIssueCounts,
 *   logged: number,
 *   summaryLogId: string,
 *   organisationId: string,
 *   registrationId: string
 * }} params
 * @returns {IndexedLogProperties}
 */
const buildSummaryLogPayload = ({
  counts,
  logged,
  summaryLogId,
  organisationId,
  registrationId
}) => ({
  message: `Summary log validation completed: fatal=${counts.fatal} error=${counts.error} warning=${counts.warning} total=${counts.total} logged=${logged} org=${organisationId} reg=${registrationId}`,
  event: {
    kind: 'event',
    category: LOGGING_EVENT_CATEGORIES.SERVER,
    action: LOGGING_EVENT_ACTIONS.SUMMARY_LOG_VALIDATION_COMPLETED,
    outcome: 'failure',
    reference: summaryLogId
  }
})

/**
 * Emits an info-level log per validation issue plus a single summary log so
 * support can investigate failures via OpenSearch DQL. No-op when there are
 * no issues. PII (issue.context.actual) and org/reg are never included in
 * per-issue logs; org/reg appear only in the run-level summary log.
 *
 * @param {{
 *   summaryLogId: string,
 *   summaryLog: SubmittedSummaryLog,
 *   issues: ValidationIssuesCollector,
 *   logger: TypedLogger
 * }} params
 */
export const logValidationIssues = ({
  summaryLogId,
  summaryLog,
  issues,
  logger
}) => {
  if (!issues.hasIssues()) {
    return
  }
  const issuesToLog = issues.getAllIssues().slice(0, MAX_VALIDATION_ISSUES)
  issuesToLog.forEach((issue) => {
    logger.info(buildIssueLogPayload(issue, summaryLogId))
  })
  logger.info(
    buildSummaryLogPayload({
      counts: issues.getCounts(),
      logged: issuesToLog.length,
      summaryLogId,
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId
    })
  )
}

export const MAX_ACTUAL_LENGTH = 200

/** @param {ValidationIssue[]} issues */
const truncateActualValues = (issues) => {
  for (const issue of issues) {
    if (
      typeof issue.context?.actual === 'string' &&
      issue.context.actual.length > MAX_ACTUAL_LENGTH
    ) {
      issue.context.actual =
        issue.context.actual.slice(0, MAX_ACTUAL_LENGTH) + '…'
    }
  }
}

/**
 * Caps the issues array and truncates long actual values for MongoDB storage.
 *
 * Both the issue count and per-issue actual values are bounded to prevent
 * the summary log document exceeding MongoDB's 16 MiB BSON limit.
 * @see https://eaflood.atlassian.net/browse/PAE-1244
 *
 * Fatal issues are always preserved — they determine the summary log status
 * and are required by the frontend to render specific error messages.
 * Non-fatal issues fill the remaining capacity.
 *
 * @param {ValidationIssue[]} allIssues - All validation issues
 * @returns {ValidationIssue[]} The capped, actual-value-truncated issues
 */
export const capIssuesForStorage = (allIssues) => {
  let cappedIssues

  if (allIssues.length <= MAX_VALIDATION_ISSUES) {
    cappedIssues = allIssues
  } else {
    const fatal = allIssues.filter(
      (issue) => issue.severity === VALIDATION_SEVERITY.FATAL
    )
    const nonFatal = allIssues.filter(
      (issue) => issue.severity !== VALIDATION_SEVERITY.FATAL
    )
    const cappedFatal = fatal.slice(0, MAX_VALIDATION_ISSUES)
    const nonFatalSlots = Math.max(
      0,
      MAX_VALIDATION_ISSUES - cappedFatal.length
    )
    cappedIssues = [...cappedFatal, ...nonFatal.slice(0, nonFatalSlots)]
  }

  truncateActualValues(cappedIssues)

  return cappedIssues
}
