import Joi from 'joi'
import { createDataSyntaxValidator } from './data-syntax.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'

describe('createDataSyntaxValidator', () => {
  // Minimal test schemas using domain schema structure
  const TEST_SCHEMAS = {
    TEST: {
      TEST_TABLE: {
        requiredHeaders: ['ROW_ID', 'TEXT_FIELD', 'NUMBER_FIELD'],
        rowIdField: 'ROW_ID',
        unfilledValues: {},
        fatalFields: ['ROW_ID'],
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
        fieldsRequiredForInclusionInWasteBalance: [
          'ROW_ID',
          'TEXT_FIELD',
          'NUMBER_FIELD'
        ]
      },
      DATE_TABLE: {
        requiredHeaders: ['ROW_ID', 'DATE_FIELD'],
        rowIdField: 'ROW_ID',
        unfilledValues: {},
        fatalFields: ['ROW_ID'],
        validationSchema: Joi.object({
          ROW_ID: Joi.number().min(1000).optional(),
          DATE_FIELD: Joi.date().optional().messages({
            'date.base': 'must be a valid date'
          })
        })
          .unknown(true)
          .prefs({ abortEarly: false }),
        fieldsRequiredForInclusionInWasteBalance: ['ROW_ID', 'DATE_FIELD']
      },
      PATTERN_TABLE: {
        requiredHeaders: ['ROW_ID', 'CODE_FIELD'],
        rowIdField: 'ROW_ID',
        unfilledValues: {},
        fatalFields: ['ROW_ID'],
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
        fieldsRequiredForInclusionInWasteBalance: ['ROW_ID', 'CODE_FIELD']
      },
      // Schema with unmapped Joi error type to test error handling
      UNMAPPED_TABLE: {
        requiredHeaders: ['ROW_ID', 'EMAIL_FIELD'],
        rowIdField: 'ROW_ID',
        unfilledValues: {},
        fatalFields: ['ROW_ID'],
        validationSchema: Joi.object({
          ROW_ID: Joi.number().min(1000).optional(),
          EMAIL_FIELD: Joi.string().email().optional() // 'string.email' is not mapped
        })
          .unknown(true)
          .prefs({ abortEarly: false }),
        fieldsRequiredForInclusionInWasteBalance: ['ROW_ID', 'EMAIL_FIELD']
      },
      // Schema without fatalFields to test fallback to empty array
      NO_FATAL_FIELDS_TABLE: {
        requiredHeaders: ['ROW_ID', 'VALUE_FIELD'],
        rowIdField: 'ROW_ID',
        unfilledValues: {},
        // fatalFields intentionally omitted to test || [] fallback
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
        fieldsRequiredForInclusionInWasteBalance: ['ROW_ID', 'VALUE_FIELD']
      },
      // Schema with string.valid() to test any.only mapping
      VALID_VALUES_TABLE: {
        requiredHeaders: ['ROW_ID', 'YES_NO_FIELD'],
        rowIdField: 'ROW_ID',
        unfilledValues: {},
        fatalFields: ['ROW_ID', 'YES_NO_FIELD'],
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
        fieldsRequiredForInclusionInWasteBalance: ['ROW_ID', 'YES_NO_FIELD']
      },
      // Schema with custom calculation validator to test calculation mismatch mapping
      CALCULATED_TABLE: {
        requiredHeaders: ['ROW_ID', 'VALUE_A', 'VALUE_B', 'CALCULATED_RESULT'],
        rowIdField: 'ROW_ID',
        unfilledValues: {},
        fatalFields: ['ROW_ID', 'CALCULATED_RESULT'],
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
        fieldsRequiredForInclusionInWasteBalance: [
          'ROW_ID',
          'VALUE_A',
          'VALUE_B',
          'CALCULATED_RESULT'
        ]
      }
    }
  }

  /**
   * Creates parsed data structure from row objects
   *
   * @param {Object} tables - Object keyed by table name, values are row objects or arrays of row objects
   * @param {Object} [options] - Additional options
   * @param {Object} [options.location] - Spreadsheet location
   * @returns {Object} Parsed data structure
   */
  const createParsedData = (tables, options = {}) => {
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

    return {
      meta: { PROCESSING_TYPE: { value: 'TEST' } },
      data
    }
  }

  const validateDataSyntax = createDataSyntaxValidator(TEST_SCHEMAS)

  const validate = (tables, options = {}) =>
    validateDataSyntax(createParsedData(tables, options))

  describe('valid data', () => {
    it('returns valid result when all data is correct', () => {
      const result = validate({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 'hello', NUMBER_FIELD: 42 }
      })

      expect(result.issues.isValid()).toBe(true)
      expect(result.issues.isFatal()).toBe(false)
      expect(result.issues.hasIssues()).toBe(false)
    })

    it('validates multiple rows', () => {
      const result = validate({
        TEST_TABLE: [
          { ROW_ID: 1000, TEXT_FIELD: 'first', NUMBER_FIELD: 1 },
          { ROW_ID: 10001, TEXT_FIELD: 'second', NUMBER_FIELD: 2 },
          { ROW_ID: 10002, TEXT_FIELD: 'third', NUMBER_FIELD: 3 }
        ]
      })

      expect(result.issues.isValid()).toBe(true)
    })

    it('allows headers in different order', () => {
      const parsed = {
        meta: { PROCESSING_TYPE: { value: 'TEST' } },
        data: {
          TEST_TABLE: {
            headers: ['NUMBER_FIELD', 'ROW_ID', 'TEXT_FIELD'],
            rows: [{ rowNumber: 2, values: [42, 1000, 'hello'] }]
          }
        }
      }

      const result = validateDataSyntax(parsed)

      expect(result.issues.isValid()).toBe(true)
    })

    it('allows additional headers beyond required ones', () => {
      const parsed = {
        meta: { PROCESSING_TYPE: { value: 'TEST' } },
        data: {
          TEST_TABLE: {
            headers: ['ROW_ID', 'TEXT_FIELD', 'NUMBER_FIELD', 'EXTRA_FIELD'],
            rows: [{ rowNumber: 2, values: [1000, 'hello', 42, 'extra'] }]
          }
        }
      }

      const result = validateDataSyntax(parsed)

      expect(result.issues.isValid()).toBe(true)
    })

    it('ignores null headers', () => {
      const parsed = {
        meta: { PROCESSING_TYPE: { value: 'TEST' } },
        data: {
          TEST_TABLE: {
            headers: ['ROW_ID', null, 'TEXT_FIELD', 'NUMBER_FIELD', null],
            rows: [
              {
                rowNumber: 2,
                values: [1000, 'ignored', 'hello', 42, 'also ignored']
              }
            ]
          }
        }
      }

      const result = validateDataSyntax(parsed)

      expect(result.issues.isValid()).toBe(true)
    })

    it('ignores special marker headers starting with __', () => {
      const parsed = {
        meta: { PROCESSING_TYPE: { value: 'TEST' } },
        data: {
          TEST_TABLE: {
            headers: [
              'ROW_ID',
              'TEXT_FIELD',
              'NUMBER_FIELD',
              '__EPR_DATA_MARKER'
            ],
            rows: [{ rowNumber: 2, values: [1000, 'hello', 42, 'marker'] }]
          }
        }
      }

      const result = validateDataSyntax(parsed)

      expect(result.issues.isValid()).toBe(true)
    })
  })

  describe('header validation (FATAL)', () => {
    it('returns fatal error when required header is missing', () => {
      const parsed = {
        meta: { PROCESSING_TYPE: { value: 'TEST' } },
        data: {
          TEST_TABLE: {
            headers: ['ROW_ID', 'TEXT_FIELD'],
            rows: [{ rowNumber: 2, values: [1000, 'hello'] }]
          }
        }
      }

      const result = validateDataSyntax(parsed)

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals).toHaveLength(1)
      expect(fatals[0].category).toBe(VALIDATION_CATEGORY.TECHNICAL)
      expect(fatals[0].message).toContain('Missing required header')
      expect(fatals[0].message).toContain('NUMBER_FIELD')
    })

    it('returns multiple fatal errors when multiple headers are missing', () => {
      const parsed = {
        meta: { PROCESSING_TYPE: { value: 'TEST' } },
        data: {
          TEST_TABLE: {
            headers: ['ROW_ID'],
            rows: [{ rowNumber: 2, values: [1000] }]
          }
        }
      }

      const result = validateDataSyntax(parsed)

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
      const result = validate({
        TEST_TABLE: {
          ROW_ID: 'not-a-number',
          TEXT_FIELD: 'hello',
          NUMBER_FIELD: 42
        }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals).toHaveLength(1)
      expect(fatals[0].message).toContain('ROW_ID')
      expect(fatals[0].context.actual).toBe('not-a-number')
    })

    it('returns FATAL error when ROW_ID is below minimum (1000)', () => {
      const result = validate({
        TEST_TABLE: { ROW_ID: 999, TEXT_FIELD: 'hello', NUMBER_FIELD: 42 }
      })

      expect(result.issues.isFatal()).toBe(true)

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals).toHaveLength(1)
      expect(fatals[0].message).toContain('ROW_ID')
      expect(fatals[0].context.actual).toBe(999)
    })

    it('returns FATAL error for each row with invalid ROW_ID', () => {
      const result = validate({
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
    it('returns error when string field is not a string', () => {
      const result = validate({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 42 }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(false)

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('TEXT_FIELD')
      expect(errors[0].message).toContain('must be a string')
    })

    it('returns error when number field is not a number', () => {
      const result = validate({
        TEST_TABLE: {
          ROW_ID: 1000,
          TEXT_FIELD: 'hello',
          NUMBER_FIELD: 'not-a-number'
        }
      })

      expect(result.issues.isValid()).toBe(false)

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('NUMBER_FIELD')
      expect(errors[0].message).toContain('must be a number')
    })

    it('returns error when number field is zero or negative', () => {
      const result = validate({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 'hello', NUMBER_FIELD: 0 }
      })

      expect(result.issues.isValid()).toBe(false)

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('NUMBER_FIELD')
      expect(errors[0].message).toContain('must be greater than 0')
    })

    it('returns error when date field is invalid', () => {
      const result = validate({
        DATE_TABLE: { ROW_ID: 1000, DATE_FIELD: 'not-a-date' }
      })

      expect(result.issues.isValid()).toBe(false)

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('DATE_FIELD')
      expect(errors[0].message).toContain('must be a valid date')
    })

    it('returns error when pattern field does not match pattern', () => {
      const result = validate({
        PATTERN_TABLE: { ROW_ID: 1000, CODE_FIELD: 'invalid' }
      })

      expect(result.issues.isValid()).toBe(false)

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('CODE_FIELD')
      expect(errors[0].message).toContain('must be in format "XX XX XX"')
    })

    it('reports errors for multiple rows', () => {
      const result = validate({
        TEST_TABLE: [
          { ROW_ID: 1000, TEXT_FIELD: 'valid', NUMBER_FIELD: 1 },
          { ROW_ID: 10001, TEXT_FIELD: 123, NUMBER_FIELD: 'bad' },
          { ROW_ID: 10002, TEXT_FIELD: 'valid', NUMBER_FIELD: 3 }
        ]
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(false)

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors).toHaveLength(2) // TEXT_FIELD and NUMBER_FIELD errors from row 2
    })
  })

  describe('location context', () => {
    it('includes spreadsheet location in error context', () => {
      const result = validate(
        {
          TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 42 }
        },
        { location: { sheet: 'Sheet1', row: 10, column: 'B' } }
      )

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors[0].context.location).toEqual({
        sheet: 'Sheet1',
        table: 'TEST_TABLE',
        row: 11, // 10 + 1 (first data row)
        column: 'C', // B + 1 (TEXT_FIELD is second column)
        header: 'TEXT_FIELD'
      })
    })

    it('calculates correct column letters for multiple errors', () => {
      const result = validate(
        {
          TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 'bad' }
        },
        { location: { sheet: 'Sheet1', row: 10, column: 'B' } }
      )

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors).toHaveLength(2)

      const textError = errors.find(
        (e) => e.context.location?.header === 'TEXT_FIELD'
      )
      const numberError = errors.find(
        (e) => e.context.location?.header === 'NUMBER_FIELD'
      )

      expect(textError.context.location.column).toBe('C')
      expect(numberError.context.location.column).toBe('D')
    })

    it('handles multi-letter column offsets correctly', () => {
      const result = validate(
        {
          TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 42 }
        },
        { location: { sheet: 'Sheet1', row: 5, column: 'Z' } }
      )

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors[0].context.location.column).toBe('AA') // Z + 1
    })

    it('handles missing location gracefully', () => {
      const result = validate({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 42 }
      })

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors[0].context.location.header).toBe('TEXT_FIELD')
      expect(errors[0].context.location.row).toBeUndefined()
      expect(errors[0].context.location.column).toBeUndefined()
    })

    it('includes location in FATAL ROW_ID errors', () => {
      const result = validate(
        {
          TEST_TABLE: { ROW_ID: 999, TEXT_FIELD: 'hello', NUMBER_FIELD: 42 }
        },
        { location: { sheet: 'Sheet1', row: 7, column: 'B' } }
      )

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals[0].context.location).toEqual({
        sheet: 'Sheet1',
        table: 'TEST_TABLE',
        row: 8,
        column: 'B',
        header: 'ROW_ID'
      })
    })

    it('handles missing location gracefully for FATAL errors', () => {
      const result = validate({
        TEST_TABLE: { ROW_ID: 999, TEXT_FIELD: 'hello', NUMBER_FIELD: 42 }
      })

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals[0].context.location.header).toBe('ROW_ID')
      expect(fatals[0].context.location.row).toBeUndefined()
    })
  })

  describe('multiple tables', () => {
    it('validates multiple tables independently', () => {
      const result = validate({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 'hello', NUMBER_FIELD: 42 },
        DATE_TABLE: { ROW_ID: 10001, DATE_FIELD: '2025-01-01' }
      })

      expect(result.issues.isValid()).toBe(true)
    })
  })

  describe('unrecognised tables', () => {
    it('returns FATAL when table has no schema for processing type', () => {
      const parsed = {
        meta: { PROCESSING_TYPE: { value: 'TEST' } },
        data: {
          TEST_TABLE: {
            headers: ['ROW_ID', 'TEXT_FIELD', 'NUMBER_FIELD'],
            rows: [{ rowNumber: 2, values: [1000, 'hello', 42] }]
          },
          UNKNOWN_TABLE: {
            headers: ['ANYTHING'],
            rows: [{ rowNumber: 6, values: ['goes'] }],
            location: { sheet: 'Sheet1', row: 5, column: 'A' }
          }
        }
      }

      const result = validateDataSyntax(parsed)

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals).toHaveLength(1)
      expect(fatals[0].category).toBe(VALIDATION_CATEGORY.TECHNICAL)
      expect(fatals[0].code).toBe(VALIDATION_CODE.TABLE_UNRECOGNISED)
      expect(fatals[0].message).toContain('UNKNOWN_TABLE')
      expect(fatals[0].context.location.table).toBe('UNKNOWN_TABLE')
    })

    it('reports all unrecognised tables when multiple are present', () => {
      const parsed = {
        meta: { PROCESSING_TYPE: { value: 'TEST' } },
        data: {
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
        }
      }

      const result = validateDataSyntax(parsed)

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals).toHaveLength(2)
      expect(fatals.map((e) => e.context.location.table)).toContain(
        'UNKNOWN_TABLE_1'
      )
      expect(fatals.map((e) => e.context.location.table)).toContain(
        'UNKNOWN_TABLE_2'
      )
    })

    it('still validates recognised tables when unrecognised tables are present', () => {
      const parsed = {
        meta: { PROCESSING_TYPE: { value: 'TEST' } },
        data: {
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
        }
      }

      const result = validateDataSyntax(parsed)

      // Should have FATAL for unrecognised table
      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals).toHaveLength(1)
      expect(fatals[0].code).toBe(VALIDATION_CODE.TABLE_UNRECOGNISED)

      // Should also have ERROR for invalid TEXT_FIELD in recognised table
      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors).toHaveLength(1)
      expect(errors[0].code).toBe(VALIDATION_CODE.INVALID_TYPE)
    })

    it('includes sheet location in error context when available', () => {
      const parsed = {
        meta: { PROCESSING_TYPE: { value: 'TEST' } },
        data: {
          UNKNOWN_TABLE: {
            headers: ['ANYTHING'],
            rows: [{ rowNumber: 16, values: ['goes'] }],
            location: { sheet: 'DataSheet', row: 15, column: 'C' }
          }
        }
      }

      const result = validateDataSyntax(parsed)

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals[0].context.location).toEqual({
        sheet: 'DataSheet',
        table: 'UNKNOWN_TABLE'
      })
    })

    it('handles missing location gracefully', () => {
      const parsed = {
        meta: { PROCESSING_TYPE: { value: 'TEST' } },
        data: {
          UNKNOWN_TABLE: {
            headers: ['ANYTHING'],
            rows: [{ rowNumber: 2, values: ['goes'] }]
            // No location
          }
        }
      }

      const result = validateDataSyntax(parsed)

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals[0].context.location).toEqual({
        table: 'UNKNOWN_TABLE'
      })
    })
  })

  describe('edge cases', () => {
    it('handles missing data section gracefully', () => {
      const result = validateDataSyntax({})

      expect(result.issues.isValid()).toBe(true)
    })

    it('handles empty data section gracefully', () => {
      const result = validateDataSyntax({ data: {} })

      expect(result.issues.isValid()).toBe(true)
    })

    it('throws error for unmapped Joi error types', () => {
      expect(() =>
        validate({
          UNMAPPED_TABLE: { ROW_ID: 1000, EMAIL_FIELD: 'not-an-email' }
        })
      ).toThrow("Unmapped Joi error type 'string.email'")
    })

    it('handles schema without fatalFields property', () => {
      const result = validate({
        NO_FATAL_FIELDS_TABLE: {
          ROW_ID: 1000,
          VALUE_FIELD: 'not-a-number'
        }
      })

      // Should produce ERROR (not FATAL) since fatalFields is undefined
      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(false)

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('VALUE_FIELD')
    })
  })

  describe('string.valid() / any.only validation', () => {
    it('accepts valid value from allowed set', () => {
      const result = validate({
        VALID_VALUES_TABLE: { ROW_ID: 1000, YES_NO_FIELD: 'Yes' }
      })

      expect(result.issues.isValid()).toBe(true)
    })

    it('accepts another valid value from allowed set', () => {
      const result = validate({
        VALID_VALUES_TABLE: { ROW_ID: 1000, YES_NO_FIELD: 'No' }
      })

      expect(result.issues.isValid()).toBe(true)
    })

    it('returns FATAL error for value not in allowed set (fatalField)', () => {
      const result = validate({
        VALID_VALUES_TABLE: { ROW_ID: 1000, YES_NO_FIELD: 'Maybe' }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals).toHaveLength(1)
      expect(fatals[0].message).toContain('YES_NO_FIELD')
      expect(fatals[0].message).toContain('must be Yes or No')
      expect(fatals[0].code).toBe(VALIDATION_CODE.INVALID_TYPE)
    })

    it('returns FATAL error for case-sensitive mismatch', () => {
      const result = validate({
        VALID_VALUES_TABLE: { ROW_ID: 1000, YES_NO_FIELD: 'yes' }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)
    })
  })

  describe('calculation mismatch validation', () => {
    it('accepts correct calculation', () => {
      const result = validate({
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
      const result = validate({
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

    it('returns FATAL error for incorrect calculation (fatalField)', () => {
      const result = validate({
        CALCULATED_TABLE: {
          ROW_ID: 1000,
          VALUE_A: 10,
          VALUE_B: 5,
          CALCULATED_RESULT: 100 // Should be 50
        }
      })

      expect(result.issues.isValid()).toBe(false)
      expect(result.issues.isFatal()).toBe(true)

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals).toHaveLength(1)
      expect(fatals[0].message).toContain('CALCULATED_RESULT')
      expect(fatals[0].message).toContain(
        'must equal GROSS_WEIGHT − TARE_WEIGHT − PALLET_WEIGHT'
      )
      expect(fatals[0].code).toBe(VALIDATION_CODE.CALCULATED_VALUE_MISMATCH)
    })
  })

  describe('validated data output', () => {
    it('returns validated rows with row IDs extracted', () => {
      const result = validate({
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

    it('attaches issues to validated rows', () => {
      const result = validate({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 42 }
      })

      const rows = result.validatedData.data.TEST_TABLE.rows
      expect(rows[0].issues).toHaveLength(1)
      expect(rows[0].issues[0].message).toContain('TEXT_FIELD')
    })

    it('returns empty rows when headers are missing', () => {
      const parsed = {
        meta: { PROCESSING_TYPE: { value: 'TEST' } },
        data: {
          TEST_TABLE: {
            headers: ['ROW_ID'],
            rows: [{ rowNumber: 2, values: [1000] }]
          }
        }
      }

      const result = validateDataSyntax(parsed)

      expect(result.validatedData.data.TEST_TABLE.rows).toEqual([])
    })
  })

  describe('errorCode (specific validation codes)', () => {
    it('sets errorCode for string.base errors', () => {
      const result = validate({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 123, NUMBER_FIELD: 42 }
      })

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors[0].code).toBe(VALIDATION_CODE.INVALID_TYPE)
      expect(errors[0].context.errorCode).toBe(VALIDATION_CODE.MUST_BE_A_STRING)
    })

    it('sets errorCode for number.base errors', () => {
      const result = validate({
        TEST_TABLE: {
          ROW_ID: 1000,
          TEXT_FIELD: 'hello',
          NUMBER_FIELD: 'not-a-number'
        }
      })

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors[0].code).toBe(VALIDATION_CODE.INVALID_TYPE)
      expect(errors[0].context.errorCode).toBe(VALIDATION_CODE.MUST_BE_A_NUMBER)
    })

    it('sets errorCode for number.greater errors', () => {
      const result = validate({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: 'hello', NUMBER_FIELD: 0 }
      })

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors[0].code).toBe(VALIDATION_CODE.VALUE_OUT_OF_RANGE)
      expect(errors[0].context.errorCode).toBe(
        VALIDATION_CODE.MUST_BE_AT_LEAST_ZERO
      )
    })

    it('sets errorCode for date.base errors', () => {
      const result = validate({
        DATE_TABLE: { ROW_ID: 1000, DATE_FIELD: 'not-a-date' }
      })

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors[0].code).toBe(VALIDATION_CODE.INVALID_DATE)
      expect(errors[0].context.errorCode).toBe(
        VALIDATION_CODE.MUST_BE_A_VALID_DATE
      )
    })

    it('sets errorCode for any.only errors', () => {
      const result = validate({
        VALID_VALUES_TABLE: { ROW_ID: 1000, YES_NO_FIELD: 'Maybe' }
      })

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals[0].code).toBe(VALIDATION_CODE.INVALID_TYPE)
      expect(fatals[0].context.errorCode).toBe(
        VALIDATION_CODE.MUST_BE_YES_OR_NO
      )
    })

    it('sets errorCode for calculation mismatch errors', () => {
      const result = validate({
        CALCULATED_TABLE: {
          ROW_ID: 1000,
          VALUE_A: 10,
          VALUE_B: 5,
          CALCULATED_RESULT: 100
        }
      })

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals[0].code).toBe(VALIDATION_CODE.CALCULATED_VALUE_MISMATCH)
      expect(fatals[0].context.errorCode).toBe(
        VALIDATION_CODE.NET_WEIGHT_CALCULATION_MISMATCH
      )
    })

    it('does not set errorCode for unmapped messages', () => {
      const result = validate({
        TEST_TABLE: { ROW_ID: 999, TEXT_FIELD: 'hello', NUMBER_FIELD: 42 }
      })

      const fatals = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )
      expect(fatals[0].code).toBe(VALIDATION_CODE.VALUE_OUT_OF_RANGE)
      expect(fatals[0].context.errorCode).toBeUndefined()
    })

    it('does not set errorCode for MISSING_REQUIRED_FIELD issues', () => {
      const result = validate({
        TEST_TABLE: { ROW_ID: 1000, TEXT_FIELD: null, NUMBER_FIELD: null }
      })

      const errors = result.issues.getIssuesBySeverity(
        VALIDATION_SEVERITY.ERROR
      )
      expect(errors[0].code).toBe(VALIDATION_CODE.FIELD_REQUIRED)
      expect(errors[0].context.errorCode).toBeUndefined()
    })
  })
})
