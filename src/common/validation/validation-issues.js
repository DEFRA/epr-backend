import { VALIDATION_SEVERITY } from '#common/enums/index.js'

/**
 * Represents a single validation issue
 *
 * @typedef {Object} ValidationIssue
 * @property {string} severity - One of VALIDATION_SEVERITY (fatal, error, warning)
 * @property {string} category - One of VALIDATION_CATEGORY (technical, business, parsing)
 * @property {string} message - Human-readable description for developers/logging (not sent to clients)
 * @property {string} code - Specific error code for i18n/translation (e.g., 'MISSING_REQUIRED_HEADER')
 * @property {Object} [context] - Additional context about the issue
 * @property {Object} [context.location] - Spreadsheet location information
 * @property {string} [context.location.sheet] - Sheet name (e.g., 'Cover', 'Received')
 * @property {string} [context.location.table] - Data table name (e.g., 'UPDATE_WASTE_BALANCE')
 * @property {number} [context.location.row] - Spreadsheet row number (1-based)
 * @property {string} [context.location.column] - Excel column letter (e.g., 'B', 'AA')
 * @property {string} [context.location.field] - Meta field name (e.g., 'REGISTRATION', 'MATERIAL')
 * @property {string} [context.location.header] - Data table column header (e.g., 'DATE_RECEIVED', 'TONNAGE')
 * @property {*} [context.expected] - The expected value (for mismatch errors)
 * @property {*} [context.actual] - The actual value that was provided (for validation errors)
 *
 * Note: All other context fields are preserved and copied to HTTP response meta.
 * See ADR 0020 for HTTP response format mapping.
 */

/**
 * Converts a validation issue to an error object suitable for HTTP responses
 *
 * Follows the format defined in ADR 0020: Summary Log Validation Output Formats
 *
 * @param {ValidationIssue} issue - The validation issue
 * @returns {Object} Error object with type and meta
 *
 * @example
 * const httpIssues = summaryLog.validation.issues.map(issueToErrorObject)
 */
export const issueToErrorObject = (issue) => {
  const errorObj = {
    type: `${issue.category.toUpperCase()}_${issue.severity.toUpperCase()}`
  }

  if (issue.context) {
    const meta = {}

    for (const [key, value] of Object.entries(issue.context)) {
      if (value !== undefined) {
        meta[key] = value
      }
    }

    if (Object.keys(meta).length > 0) {
      errorObj.meta = meta
    }
  }

  return errorObj
}

/**
 * Creates methods for adding validation issues
 *
 * @param {ValidationIssue[]} issues - The issues array
 * @param {Object} result - The result object for chaining
 * @returns {Object} Methods for adding issues
 */
const createIssueAdders = (issues, result) => {
  const addIssue = (severity, category, message, code, context = {}) => {
    if (!code) {
      throw new Error('Validation issue code is required')
    }
    const issue = { severity, category, message, code }

    if (context && Object.keys(context).length > 0) {
      issue.context = context
    }

    issues.push(issue)
    return result
  }

  return {
    addIssue,
    addFatal: (category, message, code, context = {}) =>
      addIssue(VALIDATION_SEVERITY.FATAL, category, message, code, context),
    addError: (category, message, code, context = {}) =>
      addIssue(VALIDATION_SEVERITY.ERROR, category, message, code, context),
    addWarning: (category, message, code, context = {}) =>
      addIssue(VALIDATION_SEVERITY.WARNING, category, message, code, context)
  }
}

/**
 * Creates methods for querying validation issues
 *
 * @param {ValidationIssue[]} issues - The issues array
 * @returns {Object} Methods for querying issues
 */
const createIssueQueries = (issues) => {
  const getIssuesBySeverity = (severity) =>
    issues.filter((issue) => issue.severity === severity)

  const getIssuesByCategory = (category) =>
    issues.filter((issue) => issue.category === category)

  const getIssuesByRow = () => {
    const byRow = new Map()

    for (const issue of issues) {
      const row = issue.context?.location?.row

      if (row !== undefined) {
        if (!byRow.has(row)) {
          byRow.set(row, [])
        }

        byRow.get(row).push(issue)
      }
    }

    return byRow
  }

  return {
    isFatal: () =>
      issues.some((issue) => issue.severity === VALIDATION_SEVERITY.FATAL),
    isValid: () =>
      !issues.some(
        (issue) =>
          issue.severity === VALIDATION_SEVERITY.FATAL ||
          issue.severity === VALIDATION_SEVERITY.ERROR
      ),
    hasIssues: () => issues.length > 0,
    getIssuesBySeverity,
    getIssuesByCategory,
    getIssuesByRow,
    groupBySeverity: () => ({
      [VALIDATION_SEVERITY.FATAL]: getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      ),
      [VALIDATION_SEVERITY.ERROR]: getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      ),
      [VALIDATION_SEVERITY.WARNING]: getIssuesBySeverity(
        VALIDATION_SEVERITY.WARNING
      )
    }),
    getAllIssues: () => [...issues]
  }
}

/**
 * Calculates issue counts by severity
 *
 * @param {ValidationIssue[]} issues - The issues array
 * @param {Function} getIssuesBySeverity - Function to get issues by severity
 * @returns {Object} Counts by severity
 */
const calculateIssueCounts = (issues, getIssuesBySeverity) => ({
  fatal: getIssuesBySeverity(VALIDATION_SEVERITY.FATAL).length,
  error: getIssuesBySeverity(VALIDATION_SEVERITY.ERROR).length,
  warning: getIssuesBySeverity(VALIDATION_SEVERITY.WARNING).length,
  total: issues.length
})

/**
 * Generates a human-readable validation summary
 *
 * @param {Object} counts - Issue counts by severity
 * @returns {string} Summary message
 */
const generateSummaryMessage = (counts) => {
  if (counts.total === 0) {
    return 'Validation passed with no issues'
  }

  const parts = []
  if (counts.fatal > 0) {
    parts.push(`${counts.fatal} fatal`)
  }
  if (counts.error > 0) {
    parts.push(`${counts.error} error${counts.error === 1 ? '' : 's'}`)
  }
  if (counts.warning > 0) {
    parts.push(`${counts.warning} warning${counts.warning === 1 ? '' : 's'}`)
  }

  return `Validation completed with ${parts.join(', ')}`
}

/**
 * Creates methods for transforming validation issues
 *
 * @param {ValidationIssue[]} issues - The issues array
 * @param {Function} addIssue - Function to add an issue
 * @param {Function} getIssuesBySeverity - Function to get issues by severity
 * @param {Object} result - The result object for chaining
 * @returns {Object} Methods for transforming issues
 */
const createIssueTransformers = (
  issues,
  addIssue,
  getIssuesBySeverity,
  result
) => {
  const getCounts = () => calculateIssueCounts(issues, getIssuesBySeverity)

  const getSummary = () => {
    const counts = getCounts()
    return generateSummaryMessage(counts)
  }

  const merge = (otherIssues) => {
    if (!otherIssues || typeof otherIssues.getAllIssues !== 'function') {
      throw new TypeError('Can only merge validation issues objects')
    }
    for (const issue of otherIssues.getAllIssues()) {
      addIssue(
        issue.severity,
        issue.category,
        issue.message,
        issue.code,
        issue.context
      )
    }
    return result
  }

  return {
    merge,
    getCounts,
    getSummary,
    toErrorResponse: () => ({
      issues: issues.map((issue) => issueToErrorObject(issue))
    })
  }
}

/**
 * Creates a validation issues collector using a functional approach
 *
 * Collects and manages validation issues with support for different
 * severity levels and categorization
 *
 * @returns {Object} A validation issues object with methods for managing issues
 *
 * @example
 * const issues = createValidationIssues()
 * issues.addError('business', 'Invalid data')
 * if (!issues.isValid()) {
 *   console.log(issues.getSummary())
 * }
 */
export const createValidationIssues = () => {
  const issues = []
  const result = {}

  const adders = createIssueAdders(issues, result)
  const queries = createIssueQueries(issues)
  const transformers = createIssueTransformers(
    issues,
    adders.addIssue,
    queries.getIssuesBySeverity,
    result
  )

  Object.assign(result, adders, queries, transformers)

  return result
}
