import { VALIDATION_SEVERITY } from '#common/enums/validation.js'

/**
 * Transforms a fatal validation issue to HTTP response format
 *
 * @param {Object} issue - The validation issue
 * @returns {Object} Fatal error in HTTP format
 */
const transformFatalIssue = (issue) => {
  const result = { code: issue.code }

  if (issue.context?.location) {
    result.location = { ...issue.context.location }
  }

  if (issue.context?.actual !== undefined) {
    result.actual = issue.context.actual
  }

  if (issue.context?.expected !== undefined) {
    result.expected = issue.context.expected
  }

  return result
}

/**
 * Determines the issue type (error or warning) from severity
 *
 * @param {string} severity - The severity level (fatal, error, warning)
 * @returns {string} The issue type for HTTP response
 */
const getIssueType = (severity) => {
  return severity === VALIDATION_SEVERITY.WARNING ? 'warning' : 'error'
}

/**
 * Transforms a data validation issue to HTTP response format
 *
 * @param {Object} issue - The validation issue
 * @returns {Object} Issue in HTTP format with type, code, header, column, etc.
 */
const transformDataIssue = (issue) => {
  const result = {
    type: getIssueType(issue.severity),
    code: issue.code,
    header: issue.context?.location?.header,
    column: issue.context?.location?.column
  }

  if (issue.context?.actual !== undefined) {
    result.actual = issue.context.actual
  }

  if (issue.context?.expected !== undefined) {
    result.expected = issue.context.expected
  }

  return result
}

/**
 * Groups and transforms row-level validation issues by table
 *
 * @param {Array} issues - Array of validation issues
 * @returns {Object} Concerns object with table-keyed structure
 */
const groupAndTransformRowIssues = (issues) => {
  const byTable = new Map()

  for (const issue of issues) {
    const location = issue.context?.location

    if (!location?.sheet || !location?.table || !location?.row) {
      continue
    }

    if (!byTable.has(location.table)) {
      byTable.set(location.table, {
        sheet: location.sheet,
        rows: new Map()
      })
    }

    const tableEntry = byTable.get(location.table)

    if (!tableEntry.rows.has(location.row)) {
      tableEntry.rows.set(location.row, {
        row: location.row,
        issues: []
      })
    }

    tableEntry.rows.get(location.row).issues.push(transformDataIssue(issue))
  }

  const concerns = {}

  for (const [tableName, tableEntry] of byTable) {
    concerns[tableName] = {
      sheet: tableEntry.sheet,
      rows: Array.from(tableEntry.rows.values()).sort((a, b) => a.row - b.row)
    }
  }

  return concerns
}

/**
 * Transforms internal validation structure to HTTP response format
 *
 * Implements the table-keyed response structure with:
 * - `failures`: Array of fatal meta-level errors (XOR with concerns)
 * - `concerns`: Object with table-keyed row-level errors and warnings
 *
 * @param {Object} validation - The validation object from database
 * @param {Array} [validation.issues] - Array of validation issues (from validation pipeline)
 * @param {Array} [validation.failures] - Array of failure codes (from upload rejection)
 * @returns {Object} Transformed validation for HTTP response
 */
export const transformValidationResponse = (validation) => {
  // Handle direct failures (e.g., from upload rejection)
  if (validation?.failures?.length > 0) {
    return {
      validation: {
        failures: validation.failures,
        concerns: {}
      }
    }
  }

  if (!validation?.issues || validation.issues.length === 0) {
    return {
      validation: {
        failures: [],
        concerns: {}
      }
    }
  }

  const issues = validation.issues
  const hasFatal = issues.some((i) => i.severity === VALIDATION_SEVERITY.FATAL)

  if (hasFatal) {
    return {
      validation: {
        failures: issues
          .filter((i) => i.severity === VALIDATION_SEVERITY.FATAL)
          .map(transformFatalIssue),
        concerns: {}
      }
    }
  }

  return {
    validation: {
      failures: [],
      concerns: groupAndTransformRowIssues(issues)
    }
  }
}
