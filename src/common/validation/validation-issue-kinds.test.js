import {
  cellIssue,
  fileIssue,
  metaIssue,
  removedRowIssue,
  tableIssue
} from './validation-issue-kinds.js'

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
