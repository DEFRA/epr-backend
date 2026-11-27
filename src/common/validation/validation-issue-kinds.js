import { VALIDATION_SEVERITY } from '#common/enums/validation.js'

/** @import {ValidationCategory, ValidationCode, ValidationSeverity} from '#common/enums/validation.js' */
/** @import {CalendarDate} from '#common/helpers/date-formatter.js' */
/** @import {Year} from '#common/helpers/dates/year.js' */

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
 * @typedef {{ column: string, header: string, row: number, rowId?: string, sheet: string, table: string }} TableCellLocation
 */

/**
 * The fields each cell message fills in, by its error code.
 *
 * @typedef {{
 *   DATE_AFTER_SUMMARY_LOG_YEAR: { expected: Year },
 *   DATE_BEFORE_SUMMARY_LOG_YEAR: { deadline: CalendarDate, expected: Year },
 *   PREVIOUS_YEAR_ROW_NOT_FOUND: { expected: Year },
 *   PREVIOUS_YEAR_ROW_RECEIVED_BY_OSR: { expected: Year, previousYearRowId: string },
 *   PREVIOUS_YEAR_ROW_REPATRIATED: { expected: Year, previousYearRowId: string },
 *   PREVIOUS_YEAR_ROW_VALUE_DIFFERS: { deadline: CalendarDate, expected: Year, previousYearRowId: string }
 * }} CellMessageFields
 */

/** @typedef {keyof CellMessageFields} CellMessageCode */

/**
 * A cell message and the fields it fills in.
 *
 * @typedef {{ [Code in CellMessageCode]: { errorCode: Code } & CellMessageFields[Code] }[CellMessageCode]} CellMessage
 */

/**
 * Any other cell issue, which may name a specific error code but fills in
 * none of a cell message's fields.
 *
 * @typedef {{
 *   deadline?: never,
 *   errorCode?: Exclude<ValidationCode, CellMessageCode>,
 *   previousYearRowId?: never
 * }} OtherCellMessage
 */

/**
 * @typedef {{
 *   category: ValidationCategory,
 *   code: ValidationCode,
 *   message: string,
 *   [extra: string]: unknown
 * }} IssueParams
 */

/**
 * @template Location
 * @typedef {IssueParams & { location: Location }} LocatedIssueParams
 */

/**
 * What an issue carries besides its location, if it has one.
 *
 * @template Location
 * @typedef {{ location: Location, [extra: string]: unknown }} ContextAt
 */

/** @typedef {{ category: ValidationCategory, code: ValidationCode, message: string }} IssueBasics */

/**
 * @typedef {IssueBasics & { kind: 'file', severity: 'fatal', context?: { location?: never, [extra: string]: unknown } }} FileIssue
 * @typedef {IssueBasics & { kind: 'meta', severity: 'fatal', context: ContextAt<MetaLocation> }} MetaIssue
 * @typedef {IssueBasics & { kind: 'table', severity: 'fatal', context: ContextAt<TableLocation> }} TableIssue
 * @typedef {IssueBasics & { kind: 'removedRow', severity: 'fatal', context: ContextAt<RemovedRowLocation> }} RemovedRowIssue
 * @typedef {IssueBasics & { kind: 'cell', severity: ValidationSeverity, context: ContextAt<TableCellLocation> & (CellMessage | OtherCellMessage) }} CellIssue
 */

/**
 * A summary log validation issue: what it is about decides where it is and
 * how severe it can be.
 *
 * @typedef {FileIssue | MetaIssue | TableIssue | RemovedRowIssue | CellIssue} SummaryLogIssue
 */

/**
 * About the file as a whole: rejected on upload, unreadable, or failing on
 * data of ours rather than the operator's.
 *
 * @param {IssueParams} params
 * @returns {FileIssue}
 */
export const fileIssue = ({ category, code, message, ...context }) => ({
  kind: ISSUE_KIND.FILE,
  severity: VALIDATION_SEVERITY.FATAL,
  category,
  message,
  code,
  ...(Object.keys(context).length > 0 && { context })
})

/**
 * @param {LocatedIssueParams<MetaLocation>} params
 * @returns {MetaIssue}
 */
export const metaIssue = ({ category, code, message, ...context }) => ({
  kind: ISSUE_KIND.META,
  severity: VALIDATION_SEVERITY.FATAL,
  category,
  message,
  code,
  context
})

/**
 * @param {LocatedIssueParams<TableLocation>} params
 * @returns {TableIssue}
 */
export const tableIssue = ({ category, code, message, ...context }) => ({
  kind: ISSUE_KIND.TABLE,
  severity: VALIDATION_SEVERITY.FATAL,
  category,
  message,
  code,
  context
})

/**
 * A row an earlier submission had that this file has dropped.
 *
 * @param {LocatedIssueParams<RemovedRowLocation>} params
 * @returns {RemovedRowIssue}
 */
export const removedRowIssue = ({ category, code, message, ...context }) => ({
  kind: ISSUE_KIND.REMOVED_ROW,
  severity: VALIDATION_SEVERITY.FATAL,
  category,
  message,
  code,
  context
})

/**
 * @param {LocatedIssueParams<TableCellLocation> & { severity: ValidationSeverity } & (CellMessage | OtherCellMessage)} params
 * @returns {CellIssue}
 */
export const cellIssue = ({
  severity,
  category,
  code,
  message,
  ...context
}) => ({
  kind: ISSUE_KIND.CELL,
  severity,
  category,
  message,
  code,
  context
})
