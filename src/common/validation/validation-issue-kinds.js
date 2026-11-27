import { VALIDATION_SEVERITY } from '#common/enums/validation.js'

/** @import {ValidationSeverity} from '#common/enums/validation.js' */
/** @import {ValidationIssue} from './validation-issues.js' */

/**
 * What a summary log issue is about, which decides where it is and what else
 * it carries. Only a cell issue can be less than fatal.
 */
export const ISSUE_KIND = Object.freeze({
  FILE: 'file',
  META: 'meta',
  TABLE: 'table',
  REMOVED_ROW: 'removedRow',
  CELL: 'cell'
})

/** @typedef {typeof ISSUE_KIND[keyof typeof ISSUE_KIND]} IssueKind */

/**
 * A meta field, at its cell when the file has one.
 *
 * @typedef {{ field: string } | { column: string, field: string, row: number, sheet: string }} MetaLocation
 */

/** @typedef {{ sheet: string, table: string }} TableLocation */

/** @typedef {{ rowId: string, sheet: string, table: string }} RemovedRowLocation */

/**
 * A cell in a table row. The row ID is the cell's text as entered, and is
 * absent when the row's ROW_ID cell is blank.
 *
 * @typedef {{ column: string, header: string, row: number, rowId?: string, sheet: string, table: string }} CellLocation
 */

/**
 * @typedef {{
 *   category: string,
 *   code: string,
 *   message: string,
 *   [extra: string]: unknown
 * }} IssueParams
 */

/**
 * @template Location
 * @typedef {IssueParams & { location: Location }} LocatedIssueParams
 */

/**
 * @param {IssueKind} kind
 * @param {ValidationSeverity} severity
 * @param {IssueParams} params
 * @returns {ValidationIssue}
 */
const issueOf = (kind, severity, { category, code, message, ...context }) => ({
  kind,
  severity,
  category,
  message,
  code,
  ...(Object.keys(context).length > 0 && { context })
})

/**
 * About the file as a whole: rejected on upload, unreadable, or failing on
 * data of ours rather than the operator's.
 *
 * @param {IssueParams} params
 */
export const fileIssue = (params) =>
  issueOf(ISSUE_KIND.FILE, VALIDATION_SEVERITY.FATAL, params)

/** @param {LocatedIssueParams<MetaLocation>} params */
export const metaIssue = (params) =>
  issueOf(ISSUE_KIND.META, VALIDATION_SEVERITY.FATAL, params)

/** @param {LocatedIssueParams<TableLocation>} params */
export const tableIssue = (params) =>
  issueOf(ISSUE_KIND.TABLE, VALIDATION_SEVERITY.FATAL, params)

/**
 * A row an earlier submission had that this file has dropped.
 *
 * @param {LocatedIssueParams<RemovedRowLocation>} params
 */
export const removedRowIssue = (params) =>
  issueOf(ISSUE_KIND.REMOVED_ROW, VALIDATION_SEVERITY.FATAL, params)

/** @param {LocatedIssueParams<CellLocation> & { severity: ValidationSeverity }} params */
export const cellIssue = ({ severity, ...params }) =>
  issueOf(ISSUE_KIND.CELL, severity, params)
