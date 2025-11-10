import {
  VALIDATION_CATEGORY,
  VALIDATION_SEVERITY
} from '#common/enums/index.js'

export { VALIDATION_SEVERITY, VALIDATION_CATEGORY }

/**
 * Represents a single validation issue
 *
 * @typedef {Object} ValidationIssue
 * @property {string} severity - One of VALIDATION_SEVERITY
 * @property {string} category - One of VALIDATION_CATEGORY
 * @property {string} message - Human-readable description of the issue (for developers/logging)
 * @property {string} [code] - Specific error code for i18n/translation mapping
 * @property {Object} [context] - Additional context about the issue
 * @property {string} [context.path] - JSON path to the field that failed validation (e.g., 'meta.REGISTRATION')
 * @property {Object} [context.location] - Spreadsheet location information (sheet, row, column)
 * @property {*} [context.expected] - The expected value
 * @property {*} [context.actual] - The actual value that was provided
 * @property {number} [context.row] - Row number where issue occurred
 * @property {string} [context.field] - Field/cell name
 * @property {string} [context.section] - Section of the document
 * @property {*} [context.value] - The problematic value
 * @property {string} [context.reason] - Additional reason/explanation
 */

/**
 * Builds a source pointer path from context information
 *
 * Handles both flat and nested field paths:
 * - 'SITE_NAME' → '/data/SITE_NAME'
 * - 'meta.WASTE_REGISTRATION_NUMBER' → '/data/meta/WASTE_REGISTRATION_NUMBER'
 * - Row 5, 'SITE_NAME' → '/data/rows/4/SITE_NAME'
 *
 * @param {Object} context - Issue context
 * @returns {string|null} Source pointer or null if no location info
 */
const buildSourcePointer = (context) => {
  const parts = []

  if (context.row !== undefined || context.field !== undefined) {
    parts.push('/data')
  }

  if (context.row !== undefined) {
    parts.push(`rows/${context.row - 1}`)
  }

  if (context.field) {
    const fieldParts = context.field.split('.')
    parts.push(...fieldParts)
  }

  return parts.length > 0 ? parts.join('/') : null
}

/**
 * Converts a validation issue to an error object suitable for HTTP responses
 *
 * @param {ValidationIssue} issue - The validation issue
 * @returns {Object} Error object with code, source, and meta
 */
const issueToErrorObject = (issue) => {
  const errorObj = {
    code:
      issue.code ||
      `${issue.category.toUpperCase()}_${issue.severity.toUpperCase()}`
  }

  if (issue.context) {
    const pointer = buildSourcePointer(issue.context)
    if (pointer) {
      errorObj.source = { pointer }
    }
  }

  if (issue.context && Object.keys(issue.context).length > 0) {
    errorObj.meta = { ...issue.context }
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
  const addIssue = (severity, category, message, context = {}, code = null) => {
    const issue = { severity, category, message, context }
    if (code) {
      issue.code = code
    }
    issues.push(issue)
    return result
  }

  return {
    addIssue,
    addFatal: (category, message, context, code) =>
      addIssue(VALIDATION_SEVERITY.FATAL, category, message, context, code),
    addError: (category, message, context, code) =>
      addIssue(VALIDATION_SEVERITY.ERROR, category, message, context, code),
    addWarning: (category, message, context, code) =>
      addIssue(VALIDATION_SEVERITY.WARNING, category, message, context, code)
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
      if (issue.context?.row !== undefined) {
        const row = issue.context.row
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
  const getCounts = () => ({
    fatal: getIssuesBySeverity(VALIDATION_SEVERITY.FATAL).length,
    error: getIssuesBySeverity(VALIDATION_SEVERITY.ERROR).length,
    warning: getIssuesBySeverity(VALIDATION_SEVERITY.WARNING).length,
    total: issues.length
  })

  const getSummary = () => {
    const counts = getCounts()
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

  const getSummaryMetadata = () => {
    const counts = getCounts()
    const issuesByRow = new Map()

    for (const issue of issues) {
      if (issue.context?.row !== undefined) {
        const row = issue.context.row
        if (!issuesByRow.has(row)) {
          issuesByRow.set(row, [])
        }
        issuesByRow.get(row).push(issue)
      }
    }

    const rowsWithIssues = issuesByRow.size
    const rowNumbers = Array.from(issuesByRow.keys()).sort((a, b) => a - b)

    return {
      totalIssues: counts.total,
      issuesBySeverity: {
        fatal: counts.fatal,
        error: counts.error,
        warning: counts.warning
      },
      rowsWithIssues,
      firstIssueRow: rowNumbers.length > 0 ? rowNumbers[0] : null,
      lastIssueRow:
        rowNumbers.length > 0 ? rowNumbers[rowNumbers.length - 1] : null
    }
  }

  const merge = (otherIssues) => {
    if (!otherIssues || typeof otherIssues.getAllIssues !== 'function') {
      throw new TypeError('Can only merge validation issues objects')
    }
    otherIssues.getAllIssues().forEach((issue) => {
      addIssue(
        issue.severity,
        issue.category,
        issue.message,
        issue.context,
        issue.code
      )
    })
    return result
  }

  return {
    merge,
    getCounts,
    getSummary,
    getSummaryMetadata,
    toErrorResponse: () => ({
      errors: issues.map((issue) => issueToErrorObject(issue))
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
