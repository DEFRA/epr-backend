import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { LOCATION_KEYS } from '#common/validation/validation-issues.js'

/** @import {IndexedLogProperties, TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {ValidationIssue, ValidationIssueContext, createValidationIssues} from '#common/validation/validation-issues.js' */
/** @import {SummaryLog} from '#domain/summary-logs/model.js' */

/**
 * SummaryLog after the validator has confirmed it's past PREPROCESSING (org/reg
 * guaranteed by upstream business logic but the SummaryLog typedef leaves them
 * optional to cover the PREPROCESSING state too).
 *
 * @typedef {SummaryLog & { organisationId: string, registrationId: string }} SubmittedSummaryLog
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
const buildIssueLogPayload = (issue, summaryLogId) => ({
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
    id: buildLocationId(issue.context)
  }
})

/**
 * @param {ValidationIssue[]} allIssues
 * @param {string} summaryLogId
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {IndexedLogProperties}
 */
const buildSummaryLogPayload = (
  allIssues,
  summaryLogId,
  organisationId,
  registrationId
) => {
  const counts = { fatal: 0, error: 0, warning: 0 }
  allIssues.forEach((issue) => {
    counts[issue.severity]++
  })
  return {
    message: `Summary log validation completed: fatal=${counts.fatal} error=${counts.error} warning=${counts.warning} org=${organisationId} reg=${registrationId}`,
    event: {
      kind: 'event',
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.SUMMARY_LOG_VALIDATION_COMPLETED,
      outcome: 'failure',
      reference: summaryLogId
    }
  }
}

/**
 * Emits a warn-level log per validation issue plus a single summary log so
 * support can investigate failures via OpenSearch DQL. No-op when there are
 * no issues. PII (issue.context.actual) and org/reg are never included in
 * per-issue logs; org/reg appear only in the run-level summary log.
 *
 * @param {{
 *   summaryLogId: string,
 *   summaryLog: SubmittedSummaryLog,
 *   issues: ReturnType<typeof createValidationIssues>,
 *   logger: TypedLogger
 * }} params
 */
export const logValidationIssues = ({
  summaryLogId,
  summaryLog,
  issues,
  logger
}) => {
  const allIssues = issues.getAllIssues()
  if (allIssues.length === 0) {
    return
  }
  allIssues.forEach((issue) => {
    logger.warn(buildIssueLogPayload(issue, summaryLogId))
  })
  logger.warn(
    buildSummaryLogPayload(
      allIssues,
      summaryLogId,
      summaryLog.organisationId,
      summaryLog.registrationId
    )
  )
}
