import { VALIDATION_SEVERITY } from '#common/enums/validation.js'
import { ISSUE_KIND } from '#common/validation/validation-issue-kinds.js'
import { locationOf } from '#common/validation/validation-issues.js'

/** @import {CellIssue} from '#common/validation/validation-issue-kinds.js' */
/** @import {ValidationIssue} from '#common/validation/validation-issues.js' */
/** @import {Validation} from '#domain/summary-logs/model.js' */

const DETAIL_KEYS = Object.freeze([
  'actual',
  'expected',
  'deadline',
  'previousYearRowId'
])

/**
 * The details an issue carries for the reader, beyond its code and location.
 *
 * @param {ValidationIssue} issue
 * @returns {Record<string, unknown>}
 */
const detailsOf = (issue) =>
  Object.fromEntries(
    DETAIL_KEYS.filter((key) => issue.context?.[key] !== undefined).map(
      (key) => [key, issue.context?.[key]]
    )
  )

/**
 * @param {ValidationIssue} issue
 * @returns {unknown}
 */
const errorCodeOf = (issue) => issue.context?.errorCode ?? issue.code

/**
 * Transforms a fatal validation issue to HTTP response format
 *
 * @param {ValidationIssue} issue
 * @returns {Record<string, unknown>} Fatal error in HTTP format
 */
const transformFatalIssue = (issue) => {
  const location = locationOf(issue)

  return {
    kind: issue.kind,
    code: issue.code,
    errorCode: errorCodeOf(issue),
    ...(location && { location: { ...location } }),
    ...detailsOf(issue)
  }
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
 * Transforms a cell issue to HTTP response format
 *
 * @param {CellIssue} issue
 * @returns {Record<string, unknown>} Issue in HTTP format with type, code, header, column, etc.
 */
const transformDataIssue = (issue) => ({
  type: getIssueType(issue.severity),
  code: issue.code,
  errorCode: errorCodeOf(issue),
  header: issue.context.location.header,
  column: issue.context.location.column,
  ...detailsOf(issue)
})

/**
 * @param {ValidationIssue} issue
 * @returns {issue is CellIssue}
 */
const isCellIssue = (issue) => issue.kind === ISSUE_KIND.CELL

/**
 * Groups and transforms cell issues by table
 *
 * @param {ValidationIssue[]} issues
 * @returns {Object} Concerns object with table-keyed structure
 */
const groupAndTransformRowIssues = (issues) => {
  const byTable = new Map()

  for (const issue of issues.filter(isCellIssue)) {
    const location = issue.context.location

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
 * Resolves the issue counts for the response. Uses the pre-cap counts the
 * validator stored; on the direct upload-rejection path (no stored counts) the
 * failures are all fatal, so derive from their length; otherwise zero. Always
 * returns a counts object so the response contract can require it.
 *
 * @param {Validation} [validation]
 * @returns {{ fatal: number, error: number, warning: number, total: number }}
 */
const resolveCounts = (validation) => {
  if (validation?.counts) {
    return validation.counts
  }

  const fatal = validation?.failures?.length ?? 0

  return { fatal, error: 0, warning: 0, total: fatal }
}

/**
 * Transforms internal validation structure to HTTP response format
 *
 * Implements the table-keyed response structure with:
 * - `failures`: Array of fatal meta-level errors (XOR with concerns)
 * - `concerns`: Object with table-keyed row-level errors and warnings
 * - `counts`: Issue counts by severity (always present)
 *
 * @param {Validation} [validation] - The validation object from database
 * @returns {Object} Transformed validation for HTTP response
 */
export const transformValidationResponse = (validation) => {
  const counts = resolveCounts(validation)

  if (validation?.failures && validation.failures.length > 0) {
    return {
      validation: {
        failures: validation.failures.map((failure) => ({
          ...failure,
          errorCode: failure.code
        })),
        concerns: {},
        counts
      }
    }
  }

  if (!validation?.issues || validation.issues.length === 0) {
    return {
      validation: {
        failures: [],
        concerns: {},
        counts
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
        concerns: {},
        counts
      }
    }
  }

  return {
    validation: {
      failures: [],
      concerns: groupAndTransformRowIssues(issues),
      counts
    }
  }
}
