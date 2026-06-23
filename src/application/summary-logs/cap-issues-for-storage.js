import { VALIDATION_SEVERITY } from '#common/enums/index.js'
import { MAX_VALIDATION_ISSUES } from './validate-issue-logging.js'

/** @import {ValidationIssue} from '#common/validation/validation-issues.js' */

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
