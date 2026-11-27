import { transformValidationResponse } from './transform-validation-response.js'
import { VALIDATION_SEVERITY } from '#common/enums/validation.js'
import {
  cellIssue,
  fileIssue,
  metaIssue,
  removedRowIssue
} from '#common/validation/validation-issue-kinds.js'
import { summaryLogResponseSchema } from './response.schema.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { LEDGER_ACCREDITATION_KIND } from '#domain/organisations/model.js'
import { emptyLoadsByReportingPeriod } from '#domain/summary-logs/loads-by-period-status-schema.js'

/** @import {Validation} from '#domain/summary-logs/model.js' */

describe('transformValidationResponse', () => {
  describe('when validation is empty or has no issues', () => {
    it('returns empty failures and concerns when validation is undefined', () => {
      const result = transformValidationResponse(undefined)

      expect(result).toEqual({
        validation: {
          failures: [],
          concerns: {},
          counts: { fatal: 0, error: 0, warning: 0, total: 0 }
        }
      })
    })

    it('returns empty failures and concerns when validation.issues is undefined', () => {
      const result = transformValidationResponse({})

      expect(result).toEqual({
        validation: {
          failures: [],
          concerns: {},
          counts: { fatal: 0, error: 0, warning: 0, total: 0 }
        }
      })
    })

    it('returns empty failures and concerns when validation.issues is empty', () => {
      const result = transformValidationResponse({ issues: [] })

      expect(result).toEqual({
        validation: {
          failures: [],
          concerns: {},
          counts: { fatal: 0, error: 0, warning: 0, total: 0 }
        }
      })
    })
  })

  describe('when validation has fatal issues', () => {
    it('transforms fatal issues with location, actual, and expected fields', () => {
      const validation = {
        issues: [
          metaIssue({
            category: 'business',
            message: 'Registration mismatch',
            code: 'REGISTRATION_MISMATCH',
            location: { field: 'REGISTRATION_NUMBER' },
            actual: 'REG99999',
            expected: 'REG12345'
          })
        ],
        counts: { fatal: 1, error: 0, warning: 0, total: 1 }
      }

      const result = transformValidationResponse(validation)

      expect(result).toEqual({
        validation: {
          failures: [
            {
              kind: 'meta',
              code: 'REGISTRATION_MISMATCH',
              errorCode: 'REGISTRATION_MISMATCH',
              location: { field: 'REGISTRATION_NUMBER' },
              actual: 'REG99999',
              expected: 'REG12345'
            }
          ],
          concerns: {},
          counts: { fatal: 1, error: 0, warning: 0, total: 1 }
        }
      })
    })

    it('includes the previous year row ID a link error names', () => {
      const validation = {
        issues: [
          cellIssue({
            severity: VALIDATION_SEVERITY.FATAL,
            category: 'business',
            message: 'Previous year link complete',
            code: 'PREVIOUS_YEAR_LINK',
            location: {
              sheet: 'Exported',
              table: 'RECEIVED_LOADS_FOR_EXPORT',
              row: 12,
              rowId: '1001',
              column: 'Y',
              header: 'DATE_RECEIVED_BY_OSR'
            },
            actual: '2026-12-14',
            expected: 2026,
            errorCode: 'PREVIOUS_YEAR_ROW_RECEIVED_BY_OSR',
            previousYearRowId: '1000'
          })
        ],
        counts: { fatal: 1, error: 0, warning: 0, total: 1 }
      }

      const httpResponse = {
        status: SUMMARY_LOG_STATUS.INVALID,
        year: 2027,
        ledgerAccreditation: {
          kind: LEDGER_ACCREDITATION_KIND.REGISTERED_ONLY
        },
        ...transformValidationResponse(validation)
      }

      expect(httpResponse.validation.failures).toStrictEqual([
        {
          kind: 'cell',
          code: 'PREVIOUS_YEAR_LINK',
          errorCode: 'PREVIOUS_YEAR_ROW_RECEIVED_BY_OSR',
          location: {
            sheet: 'Exported',
            table: 'RECEIVED_LOADS_FOR_EXPORT',
            row: 12,
            rowId: '1001',
            column: 'Y',
            header: 'DATE_RECEIVED_BY_OSR'
          },
          actual: '2026-12-14',
          expected: 2026,
          previousYearRowId: '1000'
        }
      ])
      expect(
        summaryLogResponseSchema.validate(httpResponse).error
      ).toBeUndefined()
    })

    it('transforms fatal issues with only code when no context', () => {
      const validation = {
        issues: [
          fileIssue({
            category: 'technical',
            message: 'Validation failed',
            code: 'VALIDATION_SYSTEM_ERROR'
          })
        ],
        counts: { fatal: 1, error: 0, warning: 0, total: 1 }
      }

      const result = transformValidationResponse(validation)

      expect(result).toEqual({
        validation: {
          failures: [
            {
              kind: 'file',
              code: 'VALIDATION_SYSTEM_ERROR',
              errorCode: 'VALIDATION_SYSTEM_ERROR'
            }
          ],
          concerns: {},
          counts: { fatal: 1, error: 0, warning: 0, total: 1 }
        }
      })
    })

    it('transforms fatal issues with rowId in location (row continuity errors)', () => {
      const validation = {
        issues: [
          removedRowIssue({
            category: 'business',
            message:
              "Row '1003' from a previous summary log submission cannot be removed.",
            code: 'SEQUENTIAL_ROW_REMOVED',
            location: {
              sheet: 'Received',
              table: 'RECEIVED_LOADS_FOR_REPROCESSING',
              rowId: '1003'
            },
            previousSummaryLog: {
              id: 'previous-summary-log-id',
              submittedAt: '2024-01-15T10:00:00.000Z'
            }
          })
        ],
        counts: { fatal: 1, error: 0, warning: 0, total: 1 }
      }

      const result = transformValidationResponse(validation)

      expect(result).toEqual({
        validation: {
          failures: [
            {
              kind: 'removedRow',
              code: 'SEQUENTIAL_ROW_REMOVED',
              errorCode: 'SEQUENTIAL_ROW_REMOVED',
              location: {
                sheet: 'Received',
                table: 'RECEIVED_LOADS_FOR_REPROCESSING',
                rowId: '1003'
              }
            }
          ],
          concerns: {},
          counts: { fatal: 1, error: 0, warning: 0, total: 1 }
        }
      })

      // Verify the response passes Hapi schema validation (this would have caught the original bug)
      const httpResponse = {
        status: SUMMARY_LOG_STATUS.INVALID,
        year: 2026,
        ledgerAccreditation: {
          kind: LEDGER_ACCREDITATION_KIND.REGISTERED_ONLY
        },
        ...result
      }
      const { error } = summaryLogResponseSchema.validate(httpResponse)
      expect(error).toBeUndefined()
    })

    it('filters out non-fatal issues when fatal issues are present', () => {
      const validation = {
        issues: [
          metaIssue({
            category: 'technical',
            message: 'Fatal error',
            code: 'TEMPLATE_VERSION_INVALID',
            location: { field: 'TEMPLATE_VERSION' }
          }),
          cellIssue({
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Data error',
            code: 'FIELD_REQUIRED',
            location: {
              sheet: 'Received',
              table: 'RECEIVED_LOADS_FOR_REPROCESSING',
              row: 8,
              column: 'B',
              header: 'ROW_ID'
            }
          })
        ]
      }

      const result = transformValidationResponse(validation)

      expect(result.validation.failures).toHaveLength(1)
      expect(result.validation.failures[0].code).toBe(
        'TEMPLATE_VERSION_INVALID'
      )
      expect(result.validation.concerns).toEqual({})
    })
  })

  describe('when validation has only non-fatal issues', () => {
    it('groups error-level issues by table and row', () => {
      const validation = {
        issues: [
          cellIssue({
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Invalid value',
            code: 'VALUE_OUT_OF_RANGE',
            location: {
              sheet: 'Received',
              table: 'RECEIVED_LOADS_FOR_REPROCESSING',
              row: 8,
              column: 'B',
              header: 'ROW_ID'
            },
            actual: 9999
          }),
          cellIssue({
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Invalid date',
            code: 'INVALID_DATE',
            location: {
              sheet: 'Received',
              table: 'RECEIVED_LOADS_FOR_REPROCESSING',
              row: 8,
              column: 'C',
              header: 'DATE_RECEIVED'
            },
            actual: 'invalid-date'
          })
        ],
        counts: { fatal: 0, error: 2, warning: 0, total: 2 }
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
          },
          counts: { fatal: 0, error: 2, warning: 0, total: 2 }
        }
      })
    })

    it('groups warning-level issues with type "warning"', () => {
      const validation = {
        issues: [
          cellIssue({
            severity: VALIDATION_SEVERITY.WARNING,
            category: 'business',
            message: 'Suspicious value',
            code: 'VALUE_OUT_OF_RANGE',
            location: {
              sheet: 'Received',
              table: 'RECEIVED_LOADS_FOR_REPROCESSING',
              row: 8,
              column: 'B',
              header: 'NET_WEIGHT'
            },
            actual: 999999
          })
        ]
      }

      const result = transformValidationResponse(validation)

      expect(
        result.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows[0]
          .issues[0]
      ).toMatchObject({
        type: 'warning',
        code: 'VALUE_OUT_OF_RANGE'
      })
    })

    it('includes expected field when present in context', () => {
      const validation = {
        issues: [
          cellIssue({
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Value mismatch',
            code: 'CALCULATED_VALUE_MISMATCH',
            location: {
              sheet: 'Received',
              table: 'RECEIVED_LOADS_FOR_REPROCESSING',
              row: 8,
              column: 'B',
              header: 'MATERIAL'
            },
            actual: 'Paper',
            expected: 'Aluminium'
          })
        ]
      }

      const result = transformValidationResponse(validation)

      expect(
        result.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows[0]
          .issues[0]
      ).toMatchObject({
        type: 'error',
        code: 'CALCULATED_VALUE_MISMATCH',
        header: 'MATERIAL',
        column: 'B',
        actual: 'Paper',
        expected: 'Aluminium'
      })
    })

    it('includes deadline field when present in context', () => {
      const validation = {
        issues: [
          cellIssue({
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Earlier year still open',
            code: 'INVALID_DATE',
            location: {
              sheet: 'Exported',
              table: 'RECEIVED_LOADS_FOR_EXPORT',
              row: 8,
              column: 'U',
              header: 'DATE_OF_EXPORT'
            },
            actual: '2026-12-30',
            expected: 2027,
            deadline: '2027-02-28',
            errorCode: 'DATE_BEFORE_SUMMARY_LOG_YEAR'
          })
        ]
      }

      const result = transformValidationResponse(validation)

      expect(
        result.validation.concerns.RECEIVED_LOADS_FOR_EXPORT.rows[0].issues[0]
      ).toMatchObject({
        errorCode: 'DATE_BEFORE_SUMMARY_LOG_YEAR',
        expected: 2027,
        deadline: '2027-02-28'
      })
    })

    it('includes the previous year row ID when present in context', () => {
      const validation = {
        issues: [
          cellIssue({
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'business',
            message: 'Previous year link repatriated',
            code: 'PREVIOUS_YEAR_LINK',
            location: {
              sheet: 'Exported',
              table: 'RECEIVED_LOADS_FOR_EXPORT',
              row: 8,
              column: 'AP',
              header: 'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
            },
            actual: '2026-12-20',
            expected: 2026,
            errorCode: 'PREVIOUS_YEAR_ROW_REPATRIATED',
            previousYearRowId: '1000'
          })
        ]
      }

      const result = transformValidationResponse(validation)

      expect(
        result.validation.concerns.RECEIVED_LOADS_FOR_EXPORT.rows[0].issues[0]
      ).toMatchObject({ previousYearRowId: '1000' })
    })

    it('sorts rows in ascending order', () => {
      const validation = {
        issues: [
          cellIssue({
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Error in row 10',
            code: 'FIELD_REQUIRED',
            location: {
              sheet: 'Received',
              table: 'RECEIVED_LOADS_FOR_REPROCESSING',
              row: 10,
              column: 'B',
              header: 'ROW_ID'
            }
          }),
          cellIssue({
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Error in row 8',
            code: 'MUST_BE_A_VALID_DATE',
            location: {
              sheet: 'Received',
              table: 'RECEIVED_LOADS_FOR_REPROCESSING',
              row: 8,
              column: 'B',
              header: 'ROW_ID'
            }
          }),
          cellIssue({
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Error in row 9',
            code: 'MUST_BE_GREATER_THAN_ZERO',
            location: {
              sheet: 'Received',
              table: 'RECEIVED_LOADS_FOR_REPROCESSING',
              row: 9,
              column: 'B',
              header: 'ROW_ID'
            }
          })
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
          cellIssue({
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Error in table 1',
            code: 'FIELD_REQUIRED',
            location: {
              sheet: 'Received',
              table: 'RECEIVED_LOADS_FOR_REPROCESSING',
              row: 8,
              column: 'B',
              header: 'ROW_ID'
            }
          }),
          cellIssue({
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Error in table 2',
            code: 'MUST_BE_A_VALID_DATE',
            location: {
              sheet: 'Dispatched',
              table: 'DISPATCHED_RECORDS',
              row: 5,
              column: 'A',
              header: 'DATE'
            }
          })
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
  })

  describe('errorCode field', () => {
    it('includes errorCode in data issues when present in context', () => {
      const validation = {
        issues: [
          cellIssue({
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Invalid value',
            code: 'INVALID_TYPE',
            location: {
              sheet: 'Received',
              table: 'RECEIVED_LOADS_FOR_REPROCESSING',
              row: 8,
              column: 'B',
              header: 'GROSS_WEIGHT'
            },
            errorCode: 'MUST_BE_A_NUMBER',
            actual: 'abc'
          })
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
          cellIssue({
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Invalid value',
            code: 'VALUE_OUT_OF_RANGE',
            location: {
              sheet: 'Received',
              table: 'RECEIVED_LOADS_FOR_REPROCESSING',
              row: 8,
              column: 'B',
              header: 'ROW_ID'
            },
            actual: 9999
          })
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
          cellIssue({
            severity: VALIDATION_SEVERITY.FATAL,
            category: 'technical',
            message: 'Invalid value',
            code: 'INVALID_TYPE',
            location: {
              sheet: 'Received',
              table: 'RECEIVED_LOADS_FOR_REPROCESSING',
              row: 8,
              column: 'B',
              header: 'GROSS_WEIGHT'
            },
            errorCode: 'MUST_BE_A_NUMBER',
            actual: 'abc'
          })
        ]
      }

      const result = transformValidationResponse(validation)

      expect(result.validation.failures[0].code).toBe('INVALID_TYPE')
      expect(result.validation.failures[0].errorCode).toBe('MUST_BE_A_NUMBER')
    })

    it('defaults errorCode to code for fatal issues without context errorCode', () => {
      const validation = {
        issues: [
          fileIssue({
            category: 'technical',
            message: 'System error',
            code: 'VALIDATION_SYSTEM_ERROR'
          })
        ]
      }

      const result = transformValidationResponse(validation)

      expect(result.validation.failures[0].code).toBe('VALIDATION_SYSTEM_ERROR')
      expect(result.validation.failures[0].errorCode).toBe(
        'VALIDATION_SYSTEM_ERROR'
      )
    })

    it('includes counts in fatal response when present', () => {
      const validation = {
        issues: [
          fileIssue({
            category: 'technical',
            message: 'System error',
            code: 'VALIDATION_SYSTEM_ERROR'
          })
        ],
        counts: { fatal: 1, error: 0, warning: 0, total: 5000 }
      }

      const result = transformValidationResponse(validation)

      expect(result.validation.counts).toEqual({
        fatal: 1,
        error: 0,
        warning: 0,
        total: 5000
      })
    })

    it('includes counts in concerns response when present', () => {
      const validation = {
        issues: [
          cellIssue({
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Invalid value',
            code: 'VALUE_OUT_OF_RANGE',
            location: {
              sheet: 'Received',
              table: 'RECEIVED_LOADS_FOR_REPROCESSING',
              row: 8,
              column: 'B',
              header: 'ROW_ID'
            }
          })
        ],
        counts: { fatal: 0, error: 1, warning: 0, total: 3000 }
      }

      const result = transformValidationResponse(validation)

      expect(result.validation.counts).toEqual({
        fatal: 0,
        error: 1,
        warning: 0,
        total: 3000
      })
    })

    it('synthesizes counts from direct failures when no stored counts (upload rejection)', () => {
      /** @type {Validation} */
      const validation = {
        failures: [{ kind: 'file', code: 'FILE_VIRUS_DETECTED' }]
      }

      const result = transformValidationResponse(validation)

      expect(result.validation.counts).toEqual({
        fatal: 1,
        error: 0,
        warning: 0,
        total: 1
      })
    })

    it('includes zero counts when there are no issues', () => {
      const result = transformValidationResponse({})

      expect(result.validation.counts).toEqual({
        fatal: 0,
        error: 0,
        warning: 0,
        total: 0
      })
    })

    it('passes response schema validation with errorCode', () => {
      const validation = {
        issues: [
          cellIssue({
            severity: VALIDATION_SEVERITY.ERROR,
            category: 'technical',
            message: 'Invalid value',
            code: 'INVALID_TYPE',
            location: {
              sheet: 'Received',
              table: 'RECEIVED_LOADS_FOR_REPROCESSING',
              row: 8,
              column: 'B',
              header: 'GROSS_WEIGHT'
            },
            errorCode: 'MUST_BE_A_NUMBER',
            actual: 'abc'
          })
        ]
      }

      const httpResponse = {
        status: SUMMARY_LOG_STATUS.VALIDATED,
        year: 2026,
        ledgerAccreditation: {
          kind: LEDGER_ACCREDITATION_KIND.REGISTERED_ONLY
        },
        processingType: 'EXPORTER',
        ...transformValidationResponse(validation),
        loadsByReportingPeriod: emptyLoadsByReportingPeriod()
      }
      const { error } = summaryLogResponseSchema.validate(httpResponse)
      expect(error).toBeUndefined()
    })

    it('passes response schema validation with counts', () => {
      const validation = {
        issues: [
          fileIssue({
            category: 'technical',
            message: 'System error',
            code: 'VALIDATION_SYSTEM_ERROR'
          })
        ],
        counts: { fatal: 1, error: 0, warning: 0, total: 101 }
      }

      const httpResponse = {
        status: SUMMARY_LOG_STATUS.INVALID,
        year: 2026,
        ledgerAccreditation: {
          kind: LEDGER_ACCREDITATION_KIND.REGISTERED_ONLY
        },
        ...transformValidationResponse(validation)
      }
      const { error } = summaryLogResponseSchema.validate(httpResponse)
      expect(error).toBeUndefined()
    })
  })
})
