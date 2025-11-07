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
  /** @type {ValidationIssue[]} */
  const issues = []

  /**
   * Adds a validation issue
   *
   * @param {string} severity - One of VALIDATION_SEVERITY
   * @param {string} category - One of VALIDATION_CATEGORY
   * @param {string} message - Human-readable description (for developers/logging)
   * @param {Object} [context] - Additional context
   * @param {string} [code] - Specific error code for i18n (e.g., 'MISSING_REQUIRED_FIELD')
   * @returns {Object} result for chaining
   */
  const addIssue = (severity, category, message, context = {}, code = null) => {
    const issue = {
      severity,
      category,
      message,
      context
    }

    if (code) {
      issue.code = code
    }

    issues.push(issue)

    return result
  }

  /**
   * Adds a fatal validation issue (unrecoverable error)
   *
   * @param {string} category - One of VALIDATION_CATEGORY
   * @param {string} message - Human-readable description (for developers/logging)
   * @param {Object} [context] - Additional context
   * @param {string} [code] - Specific error code for i18n (e.g., 'MARKER_NOT_FOUND')
   * @returns {Object} result for chaining
   */
  const addFatal = (category, message, context, code) => {
    return addIssue(VALIDATION_SEVERITY.FATAL, category, message, context, code)
  }

  /**
   * Adds an error validation issue (must be fixed)
   *
   * @param {string} category - One of VALIDATION_CATEGORY
   * @param {string} message - Human-readable description (for developers/logging)
   * @param {Object} [context] - Additional context
   * @param {string} [code] - Specific error code for i18n (e.g., 'MISSING_REQUIRED_FIELD')
   * @returns {Object} result for chaining
   */
  const addError = (category, message, context, code) => {
    return addIssue(VALIDATION_SEVERITY.ERROR, category, message, context, code)
  }

  /**
   * Adds a warning validation issue (should be reviewed)
   *
   * @param {string} category - One of VALIDATION_CATEGORY
   * @param {string} message - Human-readable description (for developers/logging)
   * @param {Object} [context] - Additional context
   * @param {string} [code] - Specific error code for i18n (e.g., 'TONNAGE_BELOW_THRESHOLD')
   * @returns {Object} result for chaining
   */
  const addWarning = (category, message, context, code) => {
    return addIssue(
      VALIDATION_SEVERITY.WARNING,
      category,
      message,
      context,
      code
    )
  }

  /**
   * Checks if there are any fatal issues
   *
   * @returns {boolean} true if any fatal issues exist
   */
  const isFatal = () => {
    return issues.some((issue) => issue.severity === VALIDATION_SEVERITY.FATAL)
  }

  /**
   * Checks if validation passed (no fatal or error issues)
   *
   * @returns {boolean} true if no fatal or error issues exist
   */
  const isValid = () => {
    return !issues.some(
      (issue) =>
        issue.severity === VALIDATION_SEVERITY.FATAL ||
        issue.severity === VALIDATION_SEVERITY.ERROR
    )
  }

  /**
   * Checks if there are any issues at all
   *
   * @returns {boolean} true if any issues exist
   */
  const hasIssues = () => {
    return issues.length > 0
  }

  /**
   * Gets all issues of a specific severity
   *
   * @param {string} severity - One of VALIDATION_SEVERITY
   * @returns {ValidationIssue[]} filtered issues
   */
  const getIssuesBySeverity = (severity) => {
    return issues.filter((issue) => issue.severity === severity)
  }

  /**
   * Gets all issues of a specific category
   *
   * @param {string} category - One of VALIDATION_CATEGORY
   * @returns {ValidationIssue[]} filtered issues
   */
  const getIssuesByCategory = (category) => {
    return issues.filter((issue) => issue.category === category)
  }

  /**
   * Groups issues by row number for row-level feedback
   *
   * @returns {Map<number, ValidationIssue[]>} issues grouped by row
   */
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

  /**
   * Groups issues by severity for summary display
   *
   * @returns {Object} issues grouped by severity level
   */
  const groupBySeverity = () => {
    return {
      [VALIDATION_SEVERITY.FATAL]: getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      ),
      [VALIDATION_SEVERITY.ERROR]: getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      ),
      [VALIDATION_SEVERITY.WARNING]: getIssuesBySeverity(
        VALIDATION_SEVERITY.WARNING
      )
    }
  }

  /**
   * Gets all issues
   *
   * @returns {ValidationIssue[]} all validation issues
   */
  const getAllIssues = () => {
    return [...issues]
  }

  /**
   * Merges issues from another validation issues object into this one
   *
   * @param {Object} otherIssues - Another validation issues object to merge
   * @returns {Object} this object for chaining
   *
   * @example
   * const schemaIssues = validateMetaSyntax(schema, data)
   * const businessIssues = validateBusinessRules(data)
   *
   * const combined = createValidationIssues()
   * combined.merge(schemaIssues).merge(businessIssues)
   */
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

  /**
   * Gets a count of issues by severity
   *
   * @returns {Object} counts by severity level
   */
  const getCounts = () => {
    return {
      fatal: getIssuesBySeverity(VALIDATION_SEVERITY.FATAL).length,
      error: getIssuesBySeverity(VALIDATION_SEVERITY.ERROR).length,
      warning: getIssuesBySeverity(VALIDATION_SEVERITY.WARNING).length,
      total: issues.length
    }
  }

  /**
   * Creates a summary message suitable for logging or error messages
   *
   * @returns {string} summary message
   */
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

  /**
   * Converts the validation issues to a structured error response
   * suitable for HTTP/REST responses
   *
   * This produces a format loosely inspired by JSON:API but not tied to it,
   * making it easy to adapt to other standards if needed.
   *
   * @returns {Object} Structured error response object
   *
   * @example
   * const issues = createValidationIssues()
   * issues.addError('technical', 'Missing required field', {
   *   row: 5,
   *   field: 'SITE_NAME',
   *   section: 'Section 1'
   * })
   *
   * const response = issues.toErrorResponse()
   * // {
   * //   errors: [{
   * //     code: 'TECHNICAL_ERROR',
   * //     source: { pointer: '/data/rows/4/SITE_NAME' },
   * //     meta: { row: 5, field: 'SITE_NAME', section: 'Section 1' }
   * //   }]
   * // }
   */
  const toErrorResponse = () => {
    return {
      errors: issues.map((issue) => issueToErrorObject(issue))
    }
  }

  const result = {
    addIssue,
    addFatal,
    addError,
    addWarning,
    isFatal,
    isValid,
    hasIssues,
    getIssuesBySeverity,
    getIssuesByCategory,
    getIssuesByRow,
    groupBySeverity,
    getAllIssues,
    merge,
    getCounts,
    getSummary,
    toErrorResponse
  }

  return result
}
