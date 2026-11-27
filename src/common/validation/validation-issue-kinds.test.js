import {
  cellIssue,
  fileIssue,
  metaIssue,
  removedRowIssue,
  tableIssue
} from './validation-issue-kinds.js'

import { toCalendarDate } from '#common/helpers/date-formatter.js'
import { toYear } from '#common/helpers/dates/year.js'

/** @import {ValidationSeverity} from '#common/enums/validation.js' */

describe('validation issue kinds', () => {
  describe('fileIssue', () => {
    it('should be a fatal issue about the file as a whole', () => {
      expect(
        fileIssue({
          category: 'technical',
          message: 'Spreadsheet buffer is empty',
          code: 'SPREADSHEET_INVALID_ERROR'
        })
      ).toStrictEqual({
        kind: 'file',
        severity: 'fatal',
        category: 'technical',
        message: 'Spreadsheet buffer is empty',
        code: 'SPREADSHEET_INVALID_ERROR'
      })
    })

    it('should carry what else it is given as context', () => {
      expect(
        fileIssue({
          category: 'business',
          message: 'Registration has no registration number',
          code: 'REGISTRATION_DATA_INVALID',
          expected: 'R26ER5001180041PL'
        })
      ).toStrictEqual({
        kind: 'file',
        severity: 'fatal',
        category: 'business',
        message: 'Registration has no registration number',
        code: 'REGISTRATION_DATA_INVALID',
        context: { expected: 'R26ER5001180041PL' }
      })
    })
  })

  describe('metaIssue', () => {
    it('should be a fatal issue at a meta field that is in the file', () => {
      expect(
        metaIssue({
          category: 'business',
          message: 'Registration number does not match',
          code: 'REGISTRATION_MISMATCH',
          location: {
            sheet: 'Cover',
            row: 4,
            column: 'C',
            field: 'REGISTRATION_NUMBER'
          },
          actual: 'R26ER0000000000PL'
        })
      ).toStrictEqual({
        kind: 'meta',
        severity: 'fatal',
        category: 'business',
        message: 'Registration number does not match',
        code: 'REGISTRATION_MISMATCH',
        context: {
          location: {
            sheet: 'Cover',
            row: 4,
            column: 'C',
            field: 'REGISTRATION_NUMBER'
          },
          actual: 'R26ER0000000000PL'
        }
      })
    })

    it('should be at the meta field alone when the file does not have it', () => {
      expect(
        metaIssue({
          category: 'business',
          message: 'Material is required',
          code: 'MATERIAL_REQUIRED',
          location: { field: 'MATERIAL' }
        })
      ).toStrictEqual({
        kind: 'meta',
        severity: 'fatal',
        category: 'business',
        message: 'Material is required',
        code: 'MATERIAL_REQUIRED',
        context: { location: { field: 'MATERIAL' } }
      })
    })
  })

  describe('tableIssue', () => {
    it('should be a fatal issue about a table', () => {
      expect(
        tableIssue({
          category: 'technical',
          message: "Missing required header 'OSR_ID'",
          code: 'HEADER_REQUIRED',
          location: { sheet: 'Exported', table: 'RECEIVED_LOADS_FOR_EXPORT' },
          expected: 'OSR_ID'
        })
      ).toStrictEqual({
        kind: 'table',
        severity: 'fatal',
        category: 'technical',
        message: "Missing required header 'OSR_ID'",
        code: 'HEADER_REQUIRED',
        context: {
          location: { sheet: 'Exported', table: 'RECEIVED_LOADS_FOR_EXPORT' },
          expected: 'OSR_ID'
        }
      })
    })
  })

  describe('removedRowIssue', () => {
    it('should be a fatal issue about a row the file no longer has', () => {
      expect(
        removedRowIssue({
          category: 'business',
          message: "Row '1000' cannot be removed",
          code: 'SEQUENTIAL_ROW_REMOVED',
          location: {
            sheet: 'Exported',
            table: 'RECEIVED_LOADS_FOR_EXPORT',
            rowId: '1000'
          }
        })
      ).toStrictEqual({
        kind: 'removedRow',
        severity: 'fatal',
        category: 'business',
        message: "Row '1000' cannot be removed",
        code: 'SEQUENTIAL_ROW_REMOVED',
        context: {
          location: {
            sheet: 'Exported',
            table: 'RECEIVED_LOADS_FOR_EXPORT',
            rowId: '1000'
          }
        }
      })
    })
  })

  describe('cellIssue', () => {
    const location = {
      sheet: 'Exported',
      table: 'RECEIVED_LOADS_FOR_EXPORT',
      row: 9,
      rowId: '1007',
      column: 'U',
      header: 'DATE_OF_EXPORT'
    }

    /** @type {ValidationSeverity[]} */
    const SEVERITIES = ['fatal', 'error', 'warning']

    it('should carry the fields its cell message fills in', () => {
      expect(
        cellIssue({
          severity: 'error',
          category: 'technical',
          message: 'Date is in an earlier year still open',
          code: 'INVALID_DATE',
          location,
          errorCode: 'DATE_BEFORE_SUMMARY_LOG_YEAR',
          expected: toYear(2027),
          deadline: toCalendarDate('2027-02-27')
        }).context
      ).toStrictEqual({
        location,
        errorCode: 'DATE_BEFORE_SUMMARY_LOG_YEAR',
        expected: 2027,
        deadline: '2027-02-27'
      })
    })

    it('should not be built without the fields its cell message fills in', () => {
      const withoutDeadline = () =>
        // @ts-expect-error -- this message needs the deadline
        cellIssue({
          severity: 'error',
          category: 'technical',
          message: 'Date is in an earlier year still open',
          code: 'INVALID_DATE',
          location,
          errorCode: 'DATE_BEFORE_SUMMARY_LOG_YEAR',
          expected: toYear(2027)
        })

      expect(withoutDeadline).toBeTypeOf('function')
    })

    it('should not carry a cell message field its code does not fill in', () => {
      const withStrayDeadline = () =>
        // @ts-expect-error -- only some cell messages give a deadline
        cellIssue({
          severity: 'error',
          category: 'technical',
          message: 'Must be a number',
          code: 'INVALID_TYPE',
          location,
          errorCode: 'MUST_BE_A_NUMBER',
          deadline: toCalendarDate('2027-02-27')
        })

      expect(withStrayDeadline).toBeTypeOf('function')
    })

    it.for(SEVERITIES)('should be a %s issue at a cell', (severity) => {
      expect(
        cellIssue({
          severity,
          category: 'technical',
          message: 'Must be a valid date',
          code: 'MUST_BE_A_VALID_DATE',
          location,
          actual: 'not a date'
        })
      ).toStrictEqual({
        kind: 'cell',
        severity,
        category: 'technical',
        message: 'Must be a valid date',
        code: 'MUST_BE_A_VALID_DATE',
        context: { location, actual: 'not a date' }
      })
    })
  })
})
