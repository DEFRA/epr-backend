import Joi from 'joi'
import {
  createDataSyntaxValidator,
  JOI_MESSAGE_TO_ERROR_CODE
} from './data-syntax.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'
import { MESSAGES } from '#domain/summary-logs/table-schemas/shared/joi-messages.js'
import { NET_WEIGHT_MESSAGES } from '#domain/summary-logs/table-schemas/shared/validators/net-weight-validator.js'
import { TONNAGE_EXPORT_MESSAGES } from '#domain/summary-logs/table-schemas/exporter/validators/tonnage-export-validator.js'
import { TONNAGE_RECEIVED_MESSAGES } from '#domain/summary-logs/table-schemas/reprocessor-input/validators/tonnage-received-validator.js'
import { UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES } from '#domain/summary-logs/table-schemas/reprocessor-output/validators/uk-packaging-weight-proportion-validator.js'
import { checkRequiredFields } from '#domain/summary-logs/table-schemas/shared/classify-helpers.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

/** @import {CellLocation, ParsedSummaryLog} from '#domain/summary-logs/extractor/port.js' */

/** @type {CellLocation} */
const DEFAULT_TEST_LOCATION = { sheet: 'TestSheet', row: 1, column: 'A' }

/**
 * Asserts the array has exactly one element and returns it (narrowed to T).
 * Lets callers access `.foo` on the result without TS complaining about
 * possibly-undefined array indices.
 *
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
const expectOne = (arr) => {
  expect(arr).toHaveLength(1)
  const [first] = arr
  if (first === undefined) {
    throw new Error('expectOne: array is empty after length assertion')
  }
  return first
}

/**
 * Asserts the array contains a matching element and returns it (narrowed to T).
 *
 * @template T
 * @param {T[]} arr
 * @param {(value: T) => boolean} predicate
 * @returns {T}
 */
const expectFind = (arr, predicate) => {
  const found = arr.find(predicate)
  if (found === undefined) {
    throw new Error('expectFind: no matching element')
  }
  return found
}

const buildClassifyForWasteBalance = (requiredFields, unfilledValues) => {
  return (data, _context) => {
    const missingResult = checkRequiredFields(
      data,
      requiredFields,
      unfilledValues
    )
    if (missingResult) {
      return missingResult
    }
    return { outcome: ROW_OUTCOME.INCLUDED, reasons: [], transactionAmount: 0 }
  }
}

describe('createDataSyntaxValidator', () => {
  // Minimal test schemas using domain schema structure
  const TEST_SCHEMAS = {
    TEST: {
      TEST_TABLE: {
        requiredHeaders: ['ROW_ID', 'TEXT_FIELD', 'NUMBER_FIELD'],
        rowIdField: 'ROW_ID',
        unfilledValues: {},

        validationSchema: Joi.object({
          ROW_ID: Joi.number().min(1000).optional().messages({
            'number.base': 'must be a number',
            'number.min': 'must be at least 1000'
          }),
          TEXT_FIELD: Joi.string().optional().messages({
            'string.base': 'must be a string'
          }),
          NUMBER_FIELD: Joi.number().greater(0).optional().messages({
            'number.base': 'must be a number',
            'number.greater': 'must be greater than 0'
          })
        })
          .unknown(true)
          .prefs({ abortEarly: false }),
        classifyForWasteBalance: buildClassifyForWasteBalance(
          ['ROW_ID', 'TEXT_FIELD', 'NUMBER_FIELD'],
          {}
        )
      },
      DATE_TABLE: {
        requiredHeaders: ['ROW_ID', 'DATE_FIELD'],
        rowIdField: 'ROW_ID',
        unfilledValues: {},

        validationSchema: Joi.object({
          ROW_ID: Joi.number().min(1000).optional(),
          DATE_FIELD: Joi.date().optional().messages({
            'date.base': 'must be a valid date'
          })
        })
          .unknown(true)
          .prefs({ abortEarly: false }),
        classifyForWasteBalance: buildClassifyForWasteBalance(
          ['ROW_ID', 'DATE_FIELD'],
          {}
        )
      },
      PATTERN_TABLE: {
        requiredHeaders: ['ROW_ID', 'CODE_FIELD'],
        rowIdField: 'ROW_ID',
        unfilledValues: {},

        validationSchema: Joi.object({
          ROW_ID: Joi.number().min(1000).optional(),
          CODE_FIELD: Joi.string()
            .pattern(/^\d{2} \d{2} \d{2}$/)
            .optional()
            .messages({
              'string.pattern.base': 'must be in format "XX XX XX"'
            })
        })
          .unknown(true)
          .prefs({ abortEarly: false }),
        classifyForWasteBalance: buildClassifyForWasteBalance(
          ['ROW_ID', 'CODE_FIELD'],
          {}
        )
      },
      // Schema with unmapped Joi error type to test error handling
      UNMAPPED_TABLE: {
        requiredHeaders: ['ROW_ID', 'EMAIL_FIELD'],
        rowIdField: 'ROW_ID',
        unfilledValues: {},

        validationSchema: Joi.object({
          ROW_ID: Joi.number().min(1000).optional(),
          EMAIL_FIELD: Joi.string().email().optional() // 'string.email' is not mapped
        })
          .unknown(true)
          .prefs({ abortEarly: false }),
        classifyForWasteBalance: buildClassifyForWasteBalance(
          ['ROW_ID', 'EMAIL_FIELD'],
          {}
        )
      },
      SIMPLE_TABLE: {
        requiredHeaders: ['ROW_ID', 'VALUE_FIELD'],
        rowIdField: 'ROW_ID',
        unfilledValues: {},
        validationSchema: Joi.object({
          ROW_ID: Joi.number().min(1000).optional().messages({
            'number.base': 'must be a number',
            'number.min': 'must be at least 1000'
          }),
          VALUE_FIELD: Joi.number().optional().messages({
            'number.base': 'must be a number'
          })
        })
          .unknown(true)
          .prefs({ abortEarly: false }),
        classifyForWasteBalance: buildClassifyForWasteBalance(
          ['ROW_ID', 'VALUE_FIELD'],
          {}
        )
      },
      // Schema with string.valid() to test any.only mapping
      VALID_VALUES_TABLE: {
        requiredHeaders: ['ROW_ID', 'YES_NO_FIELD'],
        rowIdField: 'ROW_ID',
        unfilledValues: {},
        validationSchema: Joi.object({
          ROW_ID: Joi.number().min(1000).optional().messages({
            'number.base': 'must be a number',
            'number.min': 'must be at least 1000'
          }),
          YES_NO_FIELD: Joi.string().valid('Yes', 'No').optional().messages({
            'any.only': 'must be Yes or No'
          })
        })
          .unknown(true)
          .prefs({ abortEarly: false }),
        classifyForWasteBalance: buildClassifyForWasteBalance(
          ['ROW_ID', 'YES_NO_FIELD'],
          {}
        )
      },
      // Schema with custom calculation validator to test calculation mismatch mapping
      CALCULATED_TABLE: {
        requiredHeaders: ['ROW_ID', 'VALUE_A', 'VALUE_B', 'CALCULATED_RESULT'],
        rowIdField: 'ROW_ID',
        unfilledValues: {},
        validationSchema: Joi.object({
          ROW_ID: Joi.number().min(1000).optional().messages({
            'number.base': 'must be a number',
            'number.min': 'must be at least 1000'
          }),
          VALUE_A: Joi.number().optional(),
          VALUE_B: Joi.number().optional(),
          CALCULATED_RESULT: Joi.number().optional()
        })
          .custom((value, helpers) => {
            const { VALUE_A, VALUE_B, CALCULATED_RESULT } = value
            const allPresent =
              VALUE_A !== undefined &&
              VALUE_B !== undefined &&
              CALCULATED_RESULT !== undefined
            if (
              allPresent &&
              Math.abs(CALCULATED_RESULT - VALUE_A * VALUE_B) > 1e-9
            ) {
              return helpers.error('custom.netWeightCalculationMismatch', {
                field: 'CALCULATED_RESULT'
              })
            }
            return value
          })
          .messages({
            'custom.netWeightCalculationMismatch':
              'must equal GROSS_WEIGHT − TARE_WEIGHT − PALLET_WEIGHT'
          })
          .unknown(true)
          .prefs({ abortEarly: false }),
        classifyForWasteBalance: buildClassifyForWasteBalance(
          ['ROW_ID', 'VALUE_A', 'VALUE_B', 'CALCULATED_RESULT'],
          {}
        )
      }
    }
  }

  /**
   * Builds a ParsedSummaryLog from row-object fixtures — headers are computed
   * from the keys of the first row in each table.
   *
   * @param {Record<string,
   *   Record<string, unknown> | Array<Record<string, unknown>>
   * >} tables - keyed by table name; value is one row object or an array of row objects
   * @param {{ location?: CellLocation }} [options]
   * @returns {ParsedSummaryLog}
   */
  const parsedFromRows = (tables, options = {}) => {
    /** @type {Record<string, object>} */
    const data = {}

    for (const [tableName, rowData] of Object.entries(tables)) {
      const rows = Array.isArray(rowData) ? rowData : [rowData]
      const headers = Object.keys(rows[0])

      // Row numbers start after the header row
      // If location.row is provided, data starts at location.row + 1
      // Otherwise assume row 1 is header, data starts at row 2
      const firstDataRow = options.location?.row ? options.location.row + 1 : 2
      const rowsWithNumbers = rows.map((row, index) => ({
        rowNumber: firstDataRow + index,
        values: headers.map((h) => row[h])
      }))

      data[tableName] = {
        headers,
        rows: rowsWithNumbers,
        ...(options.location && { location: options.location })
      }
    }

    return /** @type {ParsedSummaryLog} */ ({
      meta: {
        PROCESSING_TYPE: { value: 'TEST', location: DEFAULT_TEST_LOCATION }
      },
      data
    })
  }

  /**
   * Builds a ParsedSummaryLog from explicit data-section fixtures. Sections
   * pass through verbatim — including any that omit `location`, so tests can
   * exercise data-syntax's defensive guard for parser quirks (the real parser
   * always sets location). The internal cast is the price for that flexibility.
   *
   * @param {Record<string, {
   *   headers: Array<string | null>,
   *   rows: Array<{ rowNumber: number, values: Array<unknown> }>,
   *   location?: CellLocation
   * }>} dataSections
   * @returns {ParsedSummaryLog}
   */
  const parsedFromSections = (dataSections) =>
    /** @type {ParsedSummaryLog} */ ({
      meta: {
        PROCESSING_TYPE: { value: 'TEST', location: DEFAULT_TEST_LOCATION }
      },
      data: dataSections
    })

  const validateDataSyntax = createDataSyntaxValidator(TEST_SCHEMAS)

  /**
   * Validates from row-object fixtures (headers auto-computed from keys).
   * Use when the test only cares about row values.
   *
   * @param {Parameters<typeof parsedFromRows>[0]} tables
   * @param {Parameters<typeof parsedFromRows>[1]} [options]
   */
  const validateRows = (tables, options = {}) =>
    validateDataSyntax(parsedFromRows(tables, options))

  /**
   * Validates from explicit data-section fixtures. Use when the test needs to
   * control headers/rows precisely (header order, null headers, markers, etc).
   *
   * @param {Parameters<typeof parsedFromSections>[0]} dataSections
   */
  const validateSections = (dataSections) =>
    validateDataSyntax(parsedFromSections(dataSections))

  describe('valid data', () => {
    it('returns valid result when all data is correct', () => {
      const result = validateRows({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 'hello', NUMBER_FIELD: 42 }
      })

      expect(result.issues.isValid()).toBe(true)
      expect(result.issues.isFatal()).toBe(false)
      expect(result.issues.hasIssues()).toBe(false)
    })

    it('validates multiple rows', () => {
      const result = validateRows({
        TEST_TABLE: [
          { ROW_ID: 1000, TEXT_FIELD: 'first', NUMBER_FIELD: 1 },
          { ROW_ID: 10001, TEXT_FIELD: 'second', NUMBER_FIELD: 2 },
          { ROW_ID: 10002, TEXT_FIELD: 'third', NUMBER_FIELD: 3 }
        ]
      })

      expect(result.issues.isValid()).toBe(true)
    })
  })

  describe('header handling', () => {
    it('allows headers in different order', () => {
      const result = validateSections({
        TEST_TABLE: {
          headers: ['NUMBER_FIELD', 'ROW_ID', 'TEXT_FIELD'],
          rows: [{ rowNumber: 2, values: [42, 1000, 'hello'] }]
        }
      })

      expect(result.issues.isValid()).toBe(true)
    })

    it('allows additional headers beyond required ones', () => {
      const result = validateSections({
        TEST_TABLE: {
          headers: ['ROW_ID', 'TEXT_FIELD', 'NUMBER_FIELD', 'EXTRA_FIELD'],
          rows: [{ rowNumber: 2, values: [1000, 'hello', 42, 'extra'] }]
        }
      })

      expect(result.issues.isValid()).toBe(true)
    })

    it('ignores null headers', () => {
      const result = validateSections({
        TEST_TABLE: {
          headers: ['ROW_ID', null, 'TEXT_FIELD', 'NUMBER_FIELD', null],
          rows: [
            {
              rowNumber: 2,
              values: [1000, 'ignored', 'hello', 42, 'also ignored']
            }
          ]
        }
      })

      expect(result.issues.isValid()).toBe(true)
    })

    it('ignores special marker headers starting with __', () => {
      const result = validateSections({
        TEST_TABLE: {
          headers: [
            'ROW_ID',
            'TEXT_FIELD',
            'NUMBER_FIELD',
            '__EPR_DATA_MARKER'
          ],
          rows: [{ rowNumber: 2, values: [1000, 'hello', 42, 'marker'] }]
        }
      })

      expect(result.issues.isValid()).toBe(true)
    })
  })

  describe('header validation (FATAL)', () => {
    it('returns fatal error when required header is missing', () => {
      const result = validateSections({
        TEST_TABLE: {
          headers: ['ROW_ID', 'TEXT_FIELD'],
          rows: [{ rowNumber: 2, values: [1000, 'hello'] }]
        }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.category).toBe(VALIDATION_CATEGORY.TECHNICAL)
      expect(fatal.message).toContain('Missing required header')
      expect(fatal.message).toContain('NUMBER_FIELD')
    })

    it('returns multiple fatal errors when multiple headers are missing', () => {
      const result = validateSections({
        TEST_TABLE: {
          headers: ['ROW_ID'],
          rows: [{ rowNumber: 2, values: [1000] }]
        }
      })

      expect(result.issues.isFatal()).toBe(true)

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals).toHaveLength(2)
      const messages = fatals.map((f) => f.message).join(' ')
      expect(messages).toContain('TEXT_FIELD')
      expect(messages).toContain('NUMBER_FIELD')
    })
  })

  describe('ROW_ID validation (FATAL)', () => {
    it('returns FATAL error when ROW_ID is not a number', () => {
      const result = validateRows({
        TEST_TABLE: {
          ROW_ID: 'not-a-number',
          TEXT_FIELD: 'hello',
          NUMBER_FIELD: 42
        }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.message).toContain('ROW_ID')
      expect(fatal.context?.actual).toBe('not-a-number')
    })

    it('returns FATAL error when ROW_ID is below minimum (1000)', () => {
      const result = validateRows({
        TEST_TABLE: { ROW_ID: 999, TEXT_FIELD: 'hello', NUMBER_FIELD: 42 }
      })

      expect(result.issues.isFatal()).toBe(true)

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.message).toContain('ROW_ID')
      expect(fatal.context?.actual).toBe(999)
    })

    it('returns FATAL error for each row with invalid ROW_ID', () => {
      const result = validateRows({
        TEST_TABLE: [
          { ROW_ID: 1000, TEXT_FIELD: 'valid', NUMBER_FIELD: 1 },
          { ROW_ID: 'invalid', TEXT_FIELD: 'bad', NUMBER_FIELD: 2 },
          { ROW_ID: 500, TEXT_FIELD: 'also bad', NUMBER_FIELD: 3 } // Below minimum 1000
        ]
      })

      expect(result.issues.isFatal()).toBe(true)

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals).toHaveLength(2)
    })
  })

  describe('cell validation errors', () => {
    it('returns FATAL error when string field is not a string', () => {
      const result = validateRows({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 42 }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.message).toContain('TEXT_FIELD')
      expect(fatal.message).toContain('must be a string')
    })

    it('returns FATAL error when number field is not a number', () => {
      const result = validateRows({
        TEST_TABLE: {
          ROW_ID: 1000,
          TEXT_FIELD: 'hello',
          NUMBER_FIELD: 'not-a-number'
        }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.message).toContain('NUMBER_FIELD')
      expect(fatal.message).toContain('must be a number')
    })

    it('returns FATAL error when number field is zero or negative', () => {
      const result = validateRows({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 'hello', NUMBER_FIELD: 0 }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.message).toContain('NUMBER_FIELD')
      expect(fatal.message).toContain('must be greater than 0')
    })

    it('returns FATAL error when date field is invalid', () => {
      const result = validateRows({
        DATE_TABLE: { ROW_ID: 1000, DATE_FIELD: 'not-a-date' }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.message).toContain('DATE_FIELD')
      expect(fatal.message).toContain('must be a valid date')
    })

    it('returns FATAL error when pattern field does not match pattern', () => {
      const result = validateRows({
        PATTERN_TABLE: { ROW_ID: 1000, CODE_FIELD: 'invalid' }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.message).toContain('CODE_FIELD')
      expect(fatal.message).toContain('must be in format "XX XX XX"')
    })

    it('reports FATAL errors for multiple rows', () => {
      const result = validateRows({
        TEST_TABLE: [
          { ROW_ID: 1000, TEXT_FIELD: 'valid', NUMBER_FIELD: 1 },
          { ROW_ID: 10001, TEXT_FIELD: 123, NUMBER_FIELD: 'bad' },
          { ROW_ID: 10002, TEXT_FIELD: 'valid', NUMBER_FIELD: 3 }
        ]
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals).toHaveLength(2) // TEXT_FIELD and NUMBER_FIELD errors from row 2
    })
  })

  describe('location context', () => {
    it('includes spreadsheet location in error context', () => {
      const result = validateRows(
        {
          TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 42 }
        },
        { location: { sheet: 'Sheet1', row: 10, column: 'B' } }
      )

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.context?.location).toEqual({
        sheet: 'Sheet1',
        table: 'TEST_TABLE',
        row: 11, // 10 + 1 (first data row)
        rowId: '1000',
        column: 'C', // B + 1 (TEXT_FIELD is second column)
        header: 'TEXT_FIELD'
      })
    })

    it('calculates correct column letters for multiple errors', () => {
      const result = validateRows(
        {
          TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 'bad' }
        },
        { location: { sheet: 'Sheet1', row: 10, column: 'B' } }
      )

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals).toHaveLength(2)

      const textError = expectFind(
        fatals,
        (e) => e.context?.location?.header === 'TEXT_FIELD'
      )
      const numberError = expectFind(
        fatals,
        (e) => e.context?.location?.header === 'NUMBER_FIELD'
      )

      expect(textError.context?.location?.column).toBe('C')
      expect(numberError.context?.location?.column).toBe('D')
    })

    it('handles multi-letter column offsets correctly', () => {
      const result = validateRows(
        {
          TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 42 }
        },
        { location: { sheet: 'Sheet1', row: 5, column: 'Z' } }
      )

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.context?.location?.column).toBe('AA') // Z + 1
    })

    it('handles missing location gracefully', () => {
      const result = validateRows({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 42 }
      })

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.context?.location?.header).toBe('TEXT_FIELD')
      expect(fatal.context?.location?.row).toBeUndefined()
      expect(fatal.context?.location?.column).toBeUndefined()
    })

    it('includes location in FATAL ROW_ID errors', () => {
      const result = validateRows(
        {
          TEST_TABLE: { ROW_ID: 999, TEXT_FIELD: 'hello', NUMBER_FIELD: 42 }
        },
        { location: { sheet: 'Sheet1', row: 7, column: 'B' } }
      )

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.context?.location).toEqual({
        sheet: 'Sheet1',
        table: 'TEST_TABLE',
        row: 8,
        rowId: '999',
        column: 'B',
        header: 'ROW_ID'
      })
    })

    it('handles missing location gracefully for FATAL errors', () => {
      const result = validateRows({
        TEST_TABLE: { ROW_ID: 999, TEXT_FIELD: 'hello', NUMBER_FIELD: 42 }
      })

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.context?.location?.header).toBe('ROW_ID')
      expect(fatal.context?.location?.row).toBeUndefined()
    })
  })

  describe('multiple tables', () => {
    it('validates multiple tables independently', () => {
      const result = validateRows({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 'hello', NUMBER_FIELD: 42 },
        DATE_TABLE: { ROW_ID: 10001, DATE_FIELD: '2025-01-01' }
      })

      expect(result.issues.isValid()).toBe(true)
    })

    /**
     * @type {Array<{
     *   scenario: string,
     *   tables: Record<string, Record<string, unknown>>,
     *   expectedFatalTables: string[]
     * }>}
     */
    const multiTableCases = [
      {
        scenario: 'two tables, earlier one fatal first',
        tables: {
          TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 42 },
          DATE_TABLE: { ROW_ID: 1001, DATE_FIELD: 'not-a-date' }
        },
        expectedFatalTables: ['TEST_TABLE', 'DATE_TABLE']
      },
      {
        scenario: 'two tables, later one fatal first',
        tables: {
          DATE_TABLE: { ROW_ID: 1001, DATE_FIELD: 'not-a-date' },
          TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 42 }
        },
        expectedFatalTables: ['TEST_TABLE', 'DATE_TABLE']
      },
      {
        scenario:
          'three tables on one sheet, a clean table before two failing ones',
        tables: {
          TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 'valid', NUMBER_FIELD: 1 },
          DATE_TABLE: { ROW_ID: 1001, DATE_FIELD: 'not-a-date' },
          PATTERN_TABLE: { ROW_ID: 1002, CODE_FIELD: 'invalid' }
        },
        expectedFatalTables: ['DATE_TABLE', 'PATTERN_TABLE']
      }
    ]

    it.for(multiTableCases)(
      'should report fatal cell errors for every failing table ($scenario)',
      ({ tables, expectedFatalTables }) => {
        const result = validateRows(tables, {
          location: { sheet: 'Received', row: 7, column: 'A' }
        })

        const fatalTables = result.issues
          .getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
          .map((issue) => issue.context?.location?.table)

        expect(fatalTables).toEqual(expect.arrayContaining(expectedFatalTables))
      }
    )
  })

  describe('unrecognised tables', () => {
    it('returns FATAL when table has no schema for processing type', () => {
      const result = validateSections({
        TEST_TABLE: {
          headers: ['ROW_ID', 'TEXT_FIELD', 'NUMBER_FIELD'],
          rows: [{ rowNumber: 2, values: [1000, 'hello', 42] }]
        },
        UNKNOWN_TABLE: {
          headers: ['ANYTHING'],
          rows: [{ rowNumber: 6, values: ['goes'] }],
          location: { sheet: 'Sheet1', row: 5, column: 'A' }
        }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.category).toBe(VALIDATION_CATEGORY.TECHNICAL)
      expect(fatal.code).toBe(VALIDATION_CODE.TABLE_UNRECOGNISED)
      expect(fatal.message).toContain('UNKNOWN_TABLE')
      expect(fatal.context?.location?.table).toBe('UNKNOWN_TABLE')
    })

    it('reports all unrecognised tables when multiple are present', () => {
      const result = validateSections({
        UNKNOWN_TABLE_1: {
          headers: ['FOO'],
          rows: [{ rowNumber: 6, values: ['bar'] }],
          location: { sheet: 'Sheet1', row: 5, column: 'A' }
        },
        UNKNOWN_TABLE_2: {
          headers: ['BAZ'],
          rows: [{ rowNumber: 11, values: ['qux'] }],
          location: { sheet: 'Sheet2', row: 10, column: 'B' }
        }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals).toHaveLength(2)
      expect(fatals.map((e) => e.context?.location?.table)).toContain(
        'UNKNOWN_TABLE_1'
      )
      expect(fatals.map((e) => e.context?.location?.table)).toContain(
        'UNKNOWN_TABLE_2'
      )
    })

    it('still validates recognised tables when unrecognised tables are present', () => {
      const result = validateSections({
        TEST_TABLE: {
          headers: ['ROW_ID', 'TEXT_FIELD', 'NUMBER_FIELD'],
          rows: [{ rowNumber: 3, values: [1000, 123, 42] }], // TEXT_FIELD should be string, not number
          location: { sheet: 'Sheet1', row: 2, column: 'A' }
        },
        UNKNOWN_TABLE: {
          headers: ['ANYTHING'],
          rows: [{ rowNumber: 6, values: ['goes'] }],
          location: { sheet: 'Sheet2', row: 5, column: 'A' }
        }
      })

      // Should have FATAL for unrecognised table and for invalid TEXT_FIELD
      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals).toHaveLength(2)
      expect(fatals.map((f) => f.code)).toContain(
        VALIDATION_CODE.TABLE_UNRECOGNISED
      )
      expect(fatals.map((f) => f.code)).toContain(VALIDATION_CODE.INVALID_TYPE)
    })

    it('includes sheet location in error context when available', () => {
      const result = validateSections({
        UNKNOWN_TABLE: {
          headers: ['ANYTHING'],
          rows: [{ rowNumber: 16, values: ['goes'] }],
          location: { sheet: 'DataSheet', row: 15, column: 'C' }
        }
      })

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.context?.location).toEqual({
        sheet: 'DataSheet',
        table: 'UNKNOWN_TABLE'
      })
    })

    it('handles missing location gracefully', () => {
      const result = validateSections({
        UNKNOWN_TABLE: {
          headers: ['ANYTHING'],
          rows: [{ rowNumber: 2, values: ['goes'] }]
          // No location
        }
      })

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.context?.location).toEqual({
        table: 'UNKNOWN_TABLE'
      })
    })
  })

  describe('edge cases', () => {
    it('handles missing data section gracefully', () => {
      const result = validateDataSyntax(/** @type {ParsedSummaryLog} */ ({}))

      expect(result.issues.isValid()).toBe(true)
    })

    it('handles empty data section gracefully', () => {
      const result = validateDataSyntax(
        /** @type {ParsedSummaryLog} */ ({ data: {} })
      )

      expect(result.issues.isValid()).toBe(true)
    })

    it('throws error for unmapped Joi error types', () => {
      expect(() =>
        validateRows({
          UNMAPPED_TABLE: { ROW_ID: 1000, EMAIL_FIELD: 'not-an-email' }
        })
      ).toThrow("Unmapped Joi error type 'string.email'")
    })

    it('produces FATAL errors for REJECTED rows', () => {
      const result = validateRows({
        SIMPLE_TABLE: {
          ROW_ID: 1000,
          VALUE_FIELD: 'not-a-number'
        }
      })

      // All REJECTED row errors are FATAL
      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.message).toContain('VALUE_FIELD')
    })
  })

  describe('string.valid() / any.only validation', () => {
    it('accepts valid value from allowed set', () => {
      const result = validateRows({
        VALID_VALUES_TABLE: { ROW_ID: 1000, YES_NO_FIELD: 'Yes' }
      })

      expect(result.issues.isValid()).toBe(true)
    })

    it('accepts another valid value from allowed set', () => {
      const result = validateRows({
        VALID_VALUES_TABLE: { ROW_ID: 1000, YES_NO_FIELD: 'No' }
      })

      expect(result.issues.isValid()).toBe(true)
    })

    it('returns FATAL error for value not in allowed set', () => {
      const result = validateRows({
        VALID_VALUES_TABLE: { ROW_ID: 1000, YES_NO_FIELD: 'Maybe' }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.message).toContain('YES_NO_FIELD')
      expect(fatal.message).toContain('must be Yes or No')
      expect(fatal.code).toBe(VALIDATION_CODE.INVALID_TYPE)
    })

    it('returns FATAL error for case-sensitive mismatch', () => {
      const result = validateRows({
        VALID_VALUES_TABLE: { ROW_ID: 1000, YES_NO_FIELD: 'yes' }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)
    })
  })

  describe('calculation mismatch validation', () => {
    it('accepts correct calculation', () => {
      const result = validateRows({
        CALCULATED_TABLE: {
          ROW_ID: 1000,
          VALUE_A: 10,
          VALUE_B: 5,
          CALCULATED_RESULT: 50
        }
      })

      expect(result.issues.isValid()).toBe(true)
    })

    it('skips calculation check when source fields are missing', () => {
      // If VALUE_B is missing, CALCULATED_RESULT should also be missing
      // (user hasn't filled in the calculation yet)
      const result = validateRows({
        CALCULATED_TABLE: {
          ROW_ID: 1000,
          VALUE_A: 10,
          VALUE_B: undefined,
          CALCULATED_RESULT: undefined
        }
      })

      // Row will have EXCLUDED outcome (missing fields for waste balance)
      // but no FATAL calculation mismatch error
      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals).toHaveLength(0)
    })

    it('returns FATAL error for incorrect calculation', () => {
      const result = validateRows({
        CALCULATED_TABLE: {
          ROW_ID: 1000,
          VALUE_A: 10,
          VALUE_B: 5,
          CALCULATED_RESULT: 100 // Should be 50
        }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.message).toContain('CALCULATED_RESULT')
      expect(fatal.message).toContain(
        'must equal GROSS_WEIGHT − TARE_WEIGHT − PALLET_WEIGHT'
      )
      expect(fatal.code).toBe(VALIDATION_CODE.CALCULATED_VALUE_MISMATCH)
    })
  })

  describe('validated data output', () => {
    it('returns validated rows with row IDs extracted', () => {
      const result = validateRows({
        TEST_TABLE: [
          { ROW_ID: 1000, TEXT_FIELD: 'first', NUMBER_FIELD: 1 },
          { ROW_ID: 10001, TEXT_FIELD: 'second', NUMBER_FIELD: 2 }
        ]
      })

      const rows = result.validatedData.data.TEST_TABLE.rows
      expect(rows).toHaveLength(2)
      expect(rows[0].rowId).toBe('1000')
      expect(rows[1].rowId).toBe('10001')
      expect(rows[0].issues).toEqual([])
    })

    it('clears validated rows when fatal issues are present', () => {
      const result = validateRows({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 42 }
      })

      // Fatal row errors cause rows to be cleared
      const rows = result.validatedData.data.TEST_TABLE.rows
      expect(rows).toHaveLength(0)

      // Issues are still available at the top level
      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.context?.location?.header).toBe('TEXT_FIELD')
    })

    it('returns empty rows when headers are missing', () => {
      const result = validateSections({
        TEST_TABLE: {
          headers: ['ROW_ID'],
          rows: [{ rowNumber: 2, values: [1000] }]
        }
      })

      expect(result.validatedData.data.TEST_TABLE.rows).toEqual([])
    })
  })

  describe('domain-layer row filtering', () => {
    it('filters out rows where rowIdField starts with header description text', () => {
      const result = validateRows({
        TEST_TABLE: [
          { ROW_ID: 'Row ID', TEXT_FIELD: 'Date received', NUMBER_FIELD: 42 },
          { ROW_ID: 1000, TEXT_FIELD: 'actual data', NUMBER_FIELD: 1 }
        ]
      })

      const rows = result.validatedData.data.TEST_TABLE.rows
      expect(rows).toHaveLength(1)
      expect(rows[0].rowId).toBe('1000')
      expect(result.issues.isValid()).toBe(true)
    })

    it('filters out rows where rowIdField starts with header text including description', () => {
      const result = validateRows({
        TEST_TABLE: [
          {
            ROW_ID: 'Row ID\n(Automatically generated)',
            TEXT_FIELD: 'Date',
            NUMBER_FIELD: 42
          },
          { ROW_ID: 1000, TEXT_FIELD: 'actual data', NUMBER_FIELD: 1 }
        ]
      })

      const rows = result.validatedData.data.TEST_TABLE.rows
      expect(rows).toHaveLength(1)
      expect(rows[0].rowId).toBe('1000')
    })

    it('filters out rows where rowIdField is null', () => {
      const result = validateRows({
        TEST_TABLE: [
          { ROW_ID: 1000, TEXT_FIELD: 'actual data', NUMBER_FIELD: 1 },
          { ROW_ID: null, TEXT_FIELD: 'placeholder', NUMBER_FIELD: 99 }
        ]
      })

      const rows = result.validatedData.data.TEST_TABLE.rows
      expect(rows).toHaveLength(1)
      expect(rows[0].rowId).toBe('1000')
      expect(result.issues.isValid()).toBe(true)
    })

    it('filters out rows where rowIdField is undefined', () => {
      const result = validateRows({
        TEST_TABLE: [
          { ROW_ID: 1000, TEXT_FIELD: 'actual data', NUMBER_FIELD: 1 },
          { ROW_ID: undefined, TEXT_FIELD: 'placeholder', NUMBER_FIELD: 99 }
        ]
      })

      const rows = result.validatedData.data.TEST_TABLE.rows
      expect(rows).toHaveLength(1)
      expect(rows[0].rowId).toBe('1000')
    })

    it('does not produce validation errors for filtered rows', () => {
      const result = validateRows({
        TEST_TABLE: [
          { ROW_ID: 'Row ID', TEXT_FIELD: 'not valid', NUMBER_FIELD: 42 },
          { ROW_ID: null, TEXT_FIELD: 'also not valid', NUMBER_FIELD: 42 },
          { ROW_ID: 1000, TEXT_FIELD: 'actual data', NUMBER_FIELD: 1 }
        ]
      })

      expect(result.issues.isValid()).toBe(true)
      expect(result.issues.hasIssues()).toBe(false)
    })
  })

  describe('errorCode (specific validation codes)', () => {
    it('sets errorCode for string.base errors', () => {
      const result = validateRows({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 42 }
      })

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.code).toBe(VALIDATION_CODE.INVALID_TYPE)
      expect(fatal.context?.errorCode).toBe(VALIDATION_CODE.MUST_BE_A_STRING)
    })

    it('sets errorCode for number.base errors', () => {
      const result = validateRows({
        TEST_TABLE: {
          ROW_ID: 1000,
          TEXT_FIELD: 'hello',
          NUMBER_FIELD: 'not-a-number'
        }
      })

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.code).toBe(VALIDATION_CODE.INVALID_TYPE)
      expect(fatal.context?.errorCode).toBe(VALIDATION_CODE.MUST_BE_A_NUMBER)
    })

    it('sets errorCode for number.greater errors', () => {
      const result = validateRows({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 'hello', NUMBER_FIELD: 0 }
      })

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.code).toBe(VALIDATION_CODE.VALUE_OUT_OF_RANGE)
      expect(fatal.context?.errorCode).toBe(
        VALIDATION_CODE.MUST_BE_GREATER_THAN_ZERO
      )
    })

    it('sets errorCode for date.base errors', () => {
      const result = validateRows({
        DATE_TABLE: { ROW_ID: 1000, DATE_FIELD: 'not-a-date' }
      })

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.code).toBe(VALIDATION_CODE.INVALID_DATE)
      expect(fatal.context?.errorCode).toBe(
        VALIDATION_CODE.MUST_BE_A_VALID_DATE
      )
    })

    it('sets errorCode for any.only errors', () => {
      const result = validateRows({
        VALID_VALUES_TABLE: { ROW_ID: 1000, YES_NO_FIELD: 'Maybe' }
      })

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.code).toBe(VALIDATION_CODE.INVALID_TYPE)
      expect(fatal.context?.errorCode).toBe(VALIDATION_CODE.MUST_BE_YES_OR_NO)
    })

    it('sets errorCode for calculation mismatch errors', () => {
      const result = validateRows({
        CALCULATED_TABLE: {
          ROW_ID: 1000,
          VALUE_A: 10,
          VALUE_B: 5,
          CALCULATED_RESULT: 100
        }
      })

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.code).toBe(VALIDATION_CODE.CALCULATED_VALUE_MISMATCH)
      expect(fatal.context?.errorCode).toBe(
        VALIDATION_CODE.NET_WEIGHT_CALCULATION_MISMATCH
      )
    })

    it('does not set errorCode for unmapped messages', () => {
      const result = validateRows({
        TEST_TABLE: { ROW_ID: 999, TEXT_FIELD: 'hello', NUMBER_FIELD: 42 }
      })

      const fatal = expectOne(
        result.issues.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      )
      expect(fatal.code).toBe(VALIDATION_CODE.VALUE_OUT_OF_RANGE)
      expect(fatal.context?.errorCode).toBeUndefined()
    })

    it('does not set errorCode for MISSING_REQUIRED_FIELD issues', () => {
      const result = validateRows({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: null, NUMBER_FIELD: null }
      })

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors[0].code).toBe(VALIDATION_CODE.FIELD_REQUIRED)
      expect(errors[0].context?.errorCode).toBeUndefined()
    })
  })
})

describe('JOI_MESSAGE_TO_ERROR_CODE coverage', () => {
  const allMessageSources = [
    { name: 'MESSAGES', messages: MESSAGES },
    { name: 'NET_WEIGHT_MESSAGES', messages: NET_WEIGHT_MESSAGES },
    { name: 'TONNAGE_EXPORT_MESSAGES', messages: TONNAGE_EXPORT_MESSAGES },
    { name: 'TONNAGE_RECEIVED_MESSAGES', messages: TONNAGE_RECEIVED_MESSAGES },
    {
      name: 'UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES',
      messages: UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES
    }
  ]

  it.each(allMessageSources)(
    'maps every $name value to an errorCode',
    ({ messages }) => {
      const mappedMessages = Object.keys(JOI_MESSAGE_TO_ERROR_CODE)

      for (const message of Object.values(messages)) {
        expect(mappedMessages).toContain(message)
      }
    }
  )

  it('maps every errorCode to a valid VALIDATION_CODE', () => {
    const validCodes = Object.values(VALIDATION_CODE)

    for (const errorCode of Object.values(JOI_MESSAGE_TO_ERROR_CODE)) {
      expect(validCodes).toContain(errorCode)
    }
  })
})

describe('createDataSyntaxValidator with high issue volume', () => {
  const FIELD_COUNT = 20
  const ROW_COUNT = 10_000
  const EXPECTED_ISSUES = FIELD_COUNT * ROW_COUNT

  const fieldNames = Array.from(
    { length: FIELD_COUNT },
    (_, index) => `FIELD_${index}`
  )
  const headers = ['ROW_ID', ...fieldNames]

  const buildSchemaShape = () => {
    /** @type {Record<string, import('joi').Schema>} */
    const shape = { ROW_ID: Joi.number().optional() }
    for (const name of fieldNames) {
      shape[name] = Joi.number().greater(0).optional().messages({
        'number.greater': 'must be greater than 0'
      })
    }
    return shape
  }

  const registry = {
    TEST: {
      WIDE_TABLE: {
        requiredHeaders: headers,
        rowIdField: 'ROW_ID',
        unfilledValues: {},
        validationSchema: Joi.object(buildSchemaShape())
          .unknown(true)
          .prefs({ abortEarly: false }),
        classifyForWasteBalance: buildClassifyForWasteBalance(headers, {})
      }
    }
  }

  it('accumulates a table’s issues without overflowing the call stack', () => {
    const rows = Array.from({ length: ROW_COUNT }, (_, index) => ({
      rowNumber: index + 2,
      values: [1000 + index, ...Array.from({ length: FIELD_COUNT }, () => -1)]
    }))

    const parsed = /** @type {ParsedSummaryLog} */ ({
      meta: {
        PROCESSING_TYPE: { value: 'TEST', location: DEFAULT_TEST_LOCATION }
      },
      data: {
        WIDE_TABLE: { headers, rows, location: DEFAULT_TEST_LOCATION }
      }
    })

    const validate = createDataSyntaxValidator(registry)

    const result = validate(parsed)

    expect(result.issues.getAllIssues()).toHaveLength(EXPECTED_ISSUES)
  }, 30_000)
})
