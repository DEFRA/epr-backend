import { transformValidationResponse } from './transform-validation-response.js'
import { VALIDATION_SEVERITY } from '#common/enums/validation.js'
import { summaryLogResponseSchema } from './response.schema.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

describe('transformValidationResponse', () => {
  describe('when validation is empty or has no issues', () => {
    it('returns empty failures and concerns when validation is undefined', () => {
      const result = transformValidationResponse(undefined)

      expect(result).toEqual({
        validation: {
          failures: [],
          concerns: {}
        }
      })
    })

    it('returns empty failures and concerns when validation.issues is undefined', () => {
      const result = transformValidationResponse({})

      expect(result).toEqual({
        validation: {
          failures: [],
          concerns: {}
        }
      })
    })

    it('returns empty failures and concerns when validation.issues is empty', () => {
      const result = transformValidationResponse({ issues: [] })

      expect(result).toEqual({
        validation: {
          failures: [],
          concerns: {}
        }
      })
    })
  })

  describe('when validation has fatal issues', () => {
    it('transforms fatal issues with location, actual, and expected fields', () => {
      const validation = {
        issues: [
          {
            severity: VALIDATION_SEVERITY.FATAL,
            category: 'business',
            message: 'Registration mismatch',
            code: 'REGISTRATION_MISMATCH',
            context: {
              location: { field: 'REGISTRATION_NUMBER' },
              actual: 'REG99999',
              expected: 'REG12345'
            }
          }
        ]
      }

      const result = transformValidationResponse(validation)

      expect(result).toEqual({
        validation: {
          failures: [
            {
              code: 'REGISTRATION_MISMATCH',
              errorCode: 'REGISTRATION_MISMATCH',
              location: { field: 'REGISTRATION_NUMBER' },
              actual: 'REG99999',
              expected: 'REG12345'
            }
          ],
          concerns: {}
        }
      })
    })

    it('transforms fatal issues with only code when no context', () => {
      const validation = {
        issues: [
          {
            severity: VALIDATION_SEVERITY.FATAL,
            category: 'technical',
            message: 'Validation failed',
            code: 'VALIDATION_SYSTEM_ERROR'
          }
        ]
      }

      const result = transformValidationResponse(validation)

      expect(result).toEqual({
        validation: {
          failures: [
            {
              code: 'VALIDATION_SYSTEM_ERROR',
              errorCode: 'VALIDATION_SYSTEM_ERROR'
            }
          ],
          concerns: {}
        }
      })
    })

    it('transforms fatal issues with rowId in location (row continuity errors)', () => {
      const validation = {
        issues: [
          {
            severity: VALIDATION_SEVERITY.FATAL,
            category: 'business',
            message:
              "Row 'row-3' from a previous summary log submission cannot be removed.",
            code: 'SEQUENTIAL_ROW_REMOVED',
            context: {
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                rowId: 'row-3'
              },
              previousSummaryLog: {
                id: 'previous-summary-log-id',
                submittedAt: '2024-01-15T10:00:00.000Z'
              }
            }
          }
        ]
      }

      const result = transformValidationResponse(validation)

      expect(result).toEqual({
        validation: {
          failures: [
            {
              code: 'SEQUENTIAL_ROW_REMOVED',
              errorCode: 'SEQUENTIAL_ROW_REMOVED',
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                rowId: 'row-3'
              }
            }
          ],
          concerns: {}
        }
      })

      // Verify the response passes Hapi schema validation (this would have caught the original bug)
      const httpResponse = {
        status: SUMMARY_LOG_STATUS.INVALID,
        ...result
      }
      const { error } = summaryLogResponseSchema.validate(httpResponse)
      expect(error).toBeUndefined()
    })

    it('filters out non-fatal issues when fatal issues are present', () => {
      const validation = {
        issues: [
          {
            severity: VALIDATION_SEVERITY.FATAL,
            category: 'technical',
            message: 'Fatal error',
            code: 'FATAL_ERROR',
            context: {
              location: { field: 'TEMPLATE_VERSION' }
            }
          },
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Data error',
            code: 'DATA_ERROR',
            context: {
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                row: 8,
                column: 'B',
                header: 'ROW_ID'
              }
            }
          }
        ]
      }

      const result = transformValidationResponse(validation)

      expect(result.validation.failures).toHaveLength(1)
      expect(result.validation.failures[0].code).toBe('FATAL_ERROR')
      expect(result.validation.concerns).toEqual({})
    })
  })

  describe('when validation has only non-fatal issues', () => {
    it('groups error-level issues by table and row', () => {
      const validation = {
        issues: [
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Invalid value',
            code: 'VALUE_OUT_OF_RANGE',
            context: {
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                row: 8,
                column: 'B',
                header: 'ROW_ID'
              },
              actual: 9999
            }
          },
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Invalid date',
            code: 'INVALID_DATE',
            context: {
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                row: 8,
                column: 'C',
                header: 'DATE_RECEIVED'
              },
              actual: 'invalid-date'
            }
          }
        ]
      }

      const result = transformValidationResponse(validation)

      expect(result).toEqual({
        validation: {
          failures: [],
          concerns: {
            RECEIVED_LOADS_FOR_REPROCESSING: {
              sheet: 'Received',
              rows: [
                {
                  row: 8,
                  issues: [
                    {
                      type: 'error',
                      code: 'VALUE_OUT_OF_RANGE',
                      errorCode: 'VALUE_OUT_OF_RANGE',
                      header: 'ROW_ID',
                      column: 'B',
                      actual: 9999
                    },
                    {
                      type: 'error',
                      code: 'INVALID_DATE',
                      errorCode: 'INVALID_DATE',
                      header: 'DATE_RECEIVED',
                      column: 'C',
                      actual: 'invalid-date'
                    }
                  ]
                }
              ]
            }
          }
        }
      })
    })

    it('groups warning-level issues with type "warning"', () => {
      const validation = {
        issues: [
          {
            severity: VALIDATION_SEVERITY.WARNING,
            category: 'business',
            message: 'Suspicious value',
            code: 'SUSPICIOUS_VALUE',
            context: {
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                row: 8,
                column: 'B',
                header: 'NET_WEIGHT'
              },
              actual: 999999
            }
          }
        ]
      }

      const result = transformValidationResponse(validation)

      expect(
        result.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows[0]
          .issues[0]
      ).toMatchObject({
        type: 'warning',
        code: 'SUSPICIOUS_VALUE'
      })
    })

    it('includes expected field when present in context', () => {
      const validation = {
        issues: [
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Value mismatch',
            code: 'VALUE_MISMATCH',
            context: {
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                row: 8,
                column: 'B',
                header: 'MATERIAL'
              },
              actual: 'Paper',
              expected: 'Aluminium'
            }
          }
        ]
      }

      const result = transformValidationResponse(validation)

      expect(
        result.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows[0]
          .issues[0]
      ).toMatchObject({
        type: 'error',
        code: 'VALUE_MISMATCH',
        header: 'MATERIAL',
        column: 'B',
        actual: 'Paper',
        expected: 'Aluminium'
      })
    })

    it('sorts rows in ascending order', () => {
      const validation = {
        issues: [
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Error in row 10',
            code: 'ERROR_1',
            context: {
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                row: 10,
                column: 'B',
                header: 'ROW_ID'
              }
            }
          },
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Error in row 8',
            code: 'ERROR_2',
            context: {
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                row: 8,
                column: 'B',
                header: 'ROW_ID'
              }
            }
          },
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Error in row 9',
            code: 'ERROR_3',
            context: {
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                row: 9,
                column: 'B',
                header: 'ROW_ID'
              }
            }
          }
        ]
      }

      const result = transformValidationResponse(validation)

      const rows =
        result.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows
      expect(rows).toHaveLength(3)
      expect(rows[0].row).toBe(8)
      expect(rows[1].row).toBe(9)
      expect(rows[2].row).toBe(10)
    })

    it('groups issues by multiple tables', () => {
      const validation = {
        issues: [
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Error in table 1',
            code: 'ERROR_1',
            context: {
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                row: 8,
                column: 'B',
                header: 'ROW_ID'
              }
            }
          },
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Error in table 2',
            code: 'ERROR_2',
            context: {
              location: {
                sheet: 'Dispatched',
                table: 'DISPATCHED_RECORDS',
                row: 5,
                column: 'A',
                header: 'DATE'
              }
            }
          }
        ]
      }

      const result = transformValidationResponse(validation)

      expect(Object.keys(result.validation.concerns)).toEqual([
        'RECEIVED_LOADS_FOR_REPROCESSING',
        'DISPATCHED_RECORDS'
      ])
      expect(
        result.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.sheet
      ).toBe('Received')
      expect(result.validation.concerns.DISPATCHED_RECORDS.sheet).toBe(
        'Dispatched'
      )
    })

    it('skips issues with incomplete location information (defensive coding)', () => {
      const validation = {
        issues: [
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Valid error',
            code: 'VALID_ERROR',
            context: {
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                row: 8,
                column: 'B',
                header: 'ROW_ID'
              }
            }
          },
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Missing sheet',
            code: 'MISSING_SHEET',
            context: {
              location: {
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                row: 8,
                column: 'B',
                header: 'ROW_ID'
              }
            }
          },
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Missing table',
            code: 'MISSING_TABLE',
            context: {
              location: {
                sheet: 'Received',
                row: 8,
                column: 'B',
                header: 'ROW_ID'
              }
            }
          },
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Missing row',
            code: 'MISSING_ROW',
            context: {
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                column: 'B',
                header: 'ROW_ID'
              }
            }
          },
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'No location',
            code: 'NO_LOCATION',
            context: {}
          }
        ]
      }

      const result = transformValidationResponse(validation)

      // Should only include the valid error, skipping the others
      expect(
        result.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows
      ).toHaveLength(1)
      expect(
        result.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows[0]
          .issues
      ).toHaveLength(1)
      expect(
        result.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows[0]
          .issues[0].code
      ).toBe('VALID_ERROR')
    })
  })

  describe('errorCode field', () => {
    it('includes errorCode in data issues when present in context', () => {
      const validation = {
        issues: [
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Invalid value',
            code: 'INVALID_TYPE',
            context: {
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                row: 8,
                column: 'B',
                header: 'GROSS_WEIGHT'
              },
              errorCode: 'MUST_BE_A_NUMBER',
              actual: 'abc'
            }
          }
        ]
      }

      const result = transformValidationResponse(validation)

      const issue =
        result.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows[0]
          .issues[0]
      expect(issue.code).toBe('INVALID_TYPE')
      expect(issue.errorCode).toBe('MUST_BE_A_NUMBER')
    })

    it('defaults errorCode to code for data issues without context errorCode', () => {
      const validation = {
        issues: [
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Invalid value',
            code: 'VALUE_OUT_OF_RANGE',
            context: {
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                row: 8,
                column: 'B',
                header: 'ROW_ID'
              },
              actual: 9999
            }
          }
        ]
      }

      const result = transformValidationResponse(validation)

      const issue =
        result.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows[0]
          .issues[0]
      expect(issue.code).toBe('VALUE_OUT_OF_RANGE')
      expect(issue.errorCode).toBe('VALUE_OUT_OF_RANGE')
    })

    it('includes errorCode in fatal issues when present in context', () => {
      const validation = {
        issues: [
          {
            severity: VALIDATION_SEVERITY.FATAL,
            category: 'technical',
            message: 'Invalid value',
            code: 'INVALID_TYPE',
            context: {
              location: { sheet: 'Received', table: 'TABLE', row: 8 },
              errorCode: 'MUST_BE_A_NUMBER',
              actual: 'abc'
            }
          }
        ]
      }

      const result = transformValidationResponse(validation)

      expect(result.validation.failures[0].code).toBe('INVALID_TYPE')
      expect(result.validation.failures[0].errorCode).toBe('MUST_BE_A_NUMBER')
    })

    it('defaults errorCode to code for fatal issues without context errorCode', () => {
      const validation = {
        issues: [
          {
            severity: VALIDATION_SEVERITY.FATAL,
            category: 'technical',
            message: 'System error',
            code: 'VALIDATION_SYSTEM_ERROR'
          }
        ]
      }

      const result = transformValidationResponse(validation)

      expect(result.validation.failures[0].code).toBe('VALIDATION_SYSTEM_ERROR')
      expect(result.validation.failures[0].errorCode).toBe(
        'VALIDATION_SYSTEM_ERROR'
      )
    })

    it('passes response schema validation with errorCode', () => {
      const validation = {
        issues: [
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Invalid value',
            code: 'INVALID_TYPE',
            context: {
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                row: 8,
                column: 'B',
                header: 'GROSS_WEIGHT'
              },
              errorCode: 'MUST_BE_A_NUMBER',
              actual: 'abc'
            }
          }
        ]
      }

      const httpResponse = {
        status: SUMMARY_LOG_STATUS.VALIDATED,
        ...transformValidationResponse(validation)
      }
      const { error } = summaryLogResponseSchema.validate(httpResponse)
      expect(error).toBeUndefined()
    })
  })
})
