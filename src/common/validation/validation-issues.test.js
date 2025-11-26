import {
  createValidationIssues,
  issueToErrorObject
} from './validation-issues.js'
import {
  VALIDATION_SEVERITY,
  VALIDATION_CATEGORY
} from '#common/enums/validation.js'

describe('Validation Issues', () => {
  describe('addIssue', () => {
    it('adds an issue with all properties', () => {
      const result = createValidationIssues()
      result.addIssue(
        VALIDATION_SEVERITY.ERROR,
        VALIDATION_CATEGORY.TECHNICAL,
        'Missing required field',
        'ERR_MISSING_FIELD',
        {
          location: { row: 5, field: 'PROCESSING_TYPE' }
        }
      )

      expect(result.getAllIssues()).toHaveLength(1)
      expect(result.getAllIssues()[0]).toEqual({
        severity: VALIDATION_SEVERITY.ERROR,
        category: VALIDATION_CATEGORY.TECHNICAL,
        message: 'Missing required field',
        code: 'ERR_MISSING_FIELD',
        context: {
          location: { row: 5, field: 'PROCESSING_TYPE' }
        }
      })
    })

    it('adds an issue without context', () => {
      const result = createValidationIssues()
      result.addIssue(
        VALIDATION_SEVERITY.FATAL,
        VALIDATION_CATEGORY.PARSING,
        'Could not parse file',
        'ERR_PARSE_FAILED'
      )

      expect(result.getAllIssues()).toHaveLength(1)
      expect(result.getAllIssues()[0].context).toBeUndefined()
    })

    it('returns this for chaining', () => {
      const result = createValidationIssues()
      const returned = result.addIssue(
        VALIDATION_SEVERITY.WARNING,
        VALIDATION_CATEGORY.BUSINESS,
        'Test',
        'ERR_TEST'
      )

      expect(returned).toBe(result)
    })

    it('throws error when code is missing', () => {
      const result = createValidationIssues()

      expect(() => {
        result.addIssue(
          VALIDATION_SEVERITY.ERROR,
          VALIDATION_CATEGORY.TECHNICAL,
          'Missing code'
        )
      }).toThrow('Validation issue code is required')
    })

    it('adds an issue with a code', () => {
      const result = createValidationIssues()
      result.addIssue(
        VALIDATION_SEVERITY.ERROR,
        VALIDATION_CATEGORY.TECHNICAL,
        'Invalid value',
        'ERR_INVALID_DATE',
        { row: 10, field: 'DATE' }
      )

      expect(result.getAllIssues()).toHaveLength(1)
      expect(result.getAllIssues()[0]).toEqual({
        severity: VALIDATION_SEVERITY.ERROR,
        category: VALIDATION_CATEGORY.TECHNICAL,
        message: 'Invalid value',
        code: 'ERR_INVALID_DATE',
        context: { row: 10, field: 'DATE' }
      })
    })
  })

  describe('addFatal', () => {
    it('adds a fatal issue', () => {
      const result = createValidationIssues()
      result.addFatal(
        VALIDATION_CATEGORY.PARSING,
        'Could not locate marker',
        'TEST_CODE',
        {
          marker: 'WASTE_REGISTRATION_NUMBER'
        }
      )

      expect(result.getAllIssues()).toHaveLength(1)
      expect(result.getAllIssues()[0].severity).toBe(VALIDATION_SEVERITY.FATAL)
      expect(result.getAllIssues()[0].category).toBe(
        VALIDATION_CATEGORY.PARSING
      )
      expect(result.getAllIssues()[0].message).toBe('Could not locate marker')
      expect(result.getAllIssues()[0].context).toEqual({
        marker: 'WASTE_REGISTRATION_NUMBER'
      })
    })

    it('returns this for chaining', () => {
      const result = createValidationIssues()
      const returned = result.addFatal(
        VALIDATION_CATEGORY.PARSING,
        'Test',
        'TEST_CODE'
      )

      expect(returned).toBe(result)
    })

    it('adds a fatal issue with a code', () => {
      const result = createValidationIssues()
      result.addFatal(
        VALIDATION_CATEGORY.PARSING,
        'Could not parse file',
        'ERR_PARSE_FAILED',
        { sheet: 'Received' }
      )

      expect(result.getAllIssues()).toHaveLength(1)
      expect(result.getAllIssues()[0]).toEqual({
        severity: VALIDATION_SEVERITY.FATAL,
        category: VALIDATION_CATEGORY.PARSING,
        message: 'Could not parse file',
        context: { sheet: 'Received' },
        code: 'ERR_PARSE_FAILED'
      })
    })
  })

  describe('addError', () => {
    it('adds an error issue', () => {
      const result = createValidationIssues()
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Invalid format',
        'TEST_CODE',
        {
          row: 10,
          field: 'DATE'
        }
      )

      expect(result.getAllIssues()).toHaveLength(1)
      expect(result.getAllIssues()[0].severity).toBe(VALIDATION_SEVERITY.ERROR)
      expect(result.getAllIssues()[0].category).toBe(
        VALIDATION_CATEGORY.TECHNICAL
      )
    })

    it('returns this for chaining', () => {
      const result = createValidationIssues()
      const returned = result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Test',
        'TEST_CODE'
      )

      expect(returned).toBe(result)
    })

    it('adds an error issue with a code', () => {
      const result = createValidationIssues()
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Missing required field',
        'ERR_REQUIRED_FIELD',
        { row: 15, field: 'TONNAGE' }
      )

      expect(result.getAllIssues()).toHaveLength(1)
      expect(result.getAllIssues()[0]).toEqual({
        severity: VALIDATION_SEVERITY.ERROR,
        category: VALIDATION_CATEGORY.TECHNICAL,
        message: 'Missing required field',
        context: { row: 15, field: 'TONNAGE' },
        code: 'ERR_REQUIRED_FIELD'
      })
    })
  })

  describe('addWarning', () => {
    it('adds a warning issue', () => {
      const result = createValidationIssues()
      result.addWarning(
        VALIDATION_CATEGORY.BUSINESS,
        'Load will not be added to balance',
        'TEST_CODE',
        {
          row: 15,
          reason: 'Missing section 1 information'
        }
      )

      expect(result.getAllIssues()).toHaveLength(1)
      expect(result.getAllIssues()[0].severity).toBe(
        VALIDATION_SEVERITY.WARNING
      )
      expect(result.getAllIssues()[0].category).toBe(
        VALIDATION_CATEGORY.BUSINESS
      )
    })

    it('returns this for chaining', () => {
      const result = createValidationIssues()
      const returned = result.addWarning(
        VALIDATION_CATEGORY.BUSINESS,
        'Test',
        'TEST_CODE'
      )

      expect(returned).toBe(result)
    })

    it('adds a warning issue with a code', () => {
      const result = createValidationIssues()
      result.addWarning(
        VALIDATION_CATEGORY.BUSINESS,
        'Value below threshold',
        'WARN_LOW_VALUE',
        { row: 20, field: 'TONNAGE', value: 0.001 }
      )

      expect(result.getAllIssues()).toHaveLength(1)
      expect(result.getAllIssues()[0]).toEqual({
        severity: VALIDATION_SEVERITY.WARNING,
        category: VALIDATION_CATEGORY.BUSINESS,
        message: 'Value below threshold',
        context: { row: 20, field: 'TONNAGE', value: 0.001 },
        code: 'WARN_LOW_VALUE'
      })
    })
  })

  describe('chaining', () => {
    it('allows method chaining', () => {
      const result = createValidationIssues()
        .addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal error', 'TEST_CODE')
        .addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')
        .addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2', 'TEST_CODE')
        .addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1', 'TEST_CODE')

      expect(result.getAllIssues()).toHaveLength(4)
    })
  })

  describe('isFatal', () => {
    it('returns true when there is a fatal issue', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal error', 'TEST_CODE')

      expect(result.isFatal()).toBe(true)
    })

    it('returns true when there are multiple fatal issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal error 1', 'TEST_CODE')
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal error 2', 'TEST_CODE')

      expect(result.isFatal()).toBe(true)
    })

    it('returns true when there are fatal and non-fatal issues', () => {
      const result = createValidationIssues()
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning', 'TEST_CODE')
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal error', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error', 'TEST_CODE')

      expect(result.isFatal()).toBe(true)
    })

    it('returns false when there are no fatal issues', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning', 'TEST_CODE')

      expect(result.isFatal()).toBe(false)
    })

    it('returns false when there are no issues', () => {
      const result = createValidationIssues()

      expect(result.isFatal()).toBe(false)
    })
  })

  describe('isValid', () => {
    it('returns true when there are no issues', () => {
      const result = createValidationIssues()

      expect(result.isValid()).toBe(true)
    })

    it('returns true when there are only warnings', () => {
      const result = createValidationIssues()
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 2', 'TEST_CODE')

      expect(result.isValid()).toBe(true)
    })

    it('returns false when there is a fatal issue', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal error', 'TEST_CODE')

      expect(result.isValid()).toBe(false)
    })

    it('returns false when there is an error issue', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error', 'TEST_CODE')

      expect(result.isValid()).toBe(false)
    })

    it('returns false when there are errors and warnings', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning', 'TEST_CODE')

      expect(result.isValid()).toBe(false)
    })

    it('returns false when there are fatal, error, and warning issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning', 'TEST_CODE')

      expect(result.isValid()).toBe(false)
    })
  })

  describe('hasIssues', () => {
    it('returns false when there are no issues', () => {
      const result = createValidationIssues()

      expect(result.hasIssues()).toBe(false)
    })

    it('returns true when there is at least one issue', () => {
      const result = createValidationIssues()
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning', 'TEST_CODE')

      expect(result.hasIssues()).toBe(true)
    })

    it('returns true for any type of issue', () => {
      const resultFatal = createValidationIssues().addFatal(
        VALIDATION_CATEGORY.PARSING,
        'Fatal',
        'TEST_CODE'
      )
      const resultError = createValidationIssues().addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Error',
        'TEST_CODE'
      )
      const resultWarning = createValidationIssues().addWarning(
        VALIDATION_CATEGORY.BUSINESS,
        'Warning',
        'TEST_CODE'
      )

      expect(resultFatal.hasIssues()).toBe(true)
      expect(resultError.hasIssues()).toBe(true)
      expect(resultWarning.hasIssues()).toBe(true)
    })
  })

  describe('getIssuesBySeverity', () => {
    it('returns only fatal issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 1', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 2', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1', 'TEST_CODE')

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)

      expect(fatals).toHaveLength(2)
      expect(fatals[0].message).toBe('Fatal 1')
      expect(fatals[1].message).toBe('Fatal 2')
    })

    it('returns only error issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 1', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1', 'TEST_CODE')

      const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)

      expect(errors).toHaveLength(2)
      expect(errors[0].message).toBe('Error 1')
      expect(errors[1].message).toBe('Error 2')
    })

    it('returns only warning issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 1', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 2', 'TEST_CODE')

      const warnings = result.getIssuesBySeverity(VALIDATION_SEVERITY.WARNING)

      expect(warnings).toHaveLength(2)
      expect(warnings[0].message).toBe('Warning 1')
      expect(warnings[1].message).toBe('Warning 2')
    })

    it('returns empty array when no issues of that severity', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)

      expect(fatals).toHaveLength(0)
    })
  })

  describe('getIssuesByCategory', () => {
    it('returns only parsing issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Parsing 1', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Technical 1', 'TEST_CODE')
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Parsing 2', 'TEST_CODE')

      const parsing = result.getIssuesByCategory(VALIDATION_CATEGORY.PARSING)

      expect(parsing).toHaveLength(2)
      expect(parsing[0].message).toBe('Parsing 1')
      expect(parsing[1].message).toBe('Parsing 2')
    })

    it('returns only technical issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Parsing 1', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Technical 1', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Technical 2', 'TEST_CODE')

      const technical = result.getIssuesByCategory(
        VALIDATION_CATEGORY.TECHNICAL
      )

      expect(technical).toHaveLength(2)
      expect(technical[0].message).toBe('Technical 1')
      expect(technical[1].message).toBe('Technical 2')
    })

    it('returns only business issues', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Technical 1', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Business 1', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Business 2', 'TEST_CODE')

      const business = result.getIssuesByCategory(VALIDATION_CATEGORY.BUSINESS)

      expect(business).toHaveLength(2)
      expect(business[0].message).toBe('Business 1')
      expect(business[1].message).toBe('Business 2')
    })

    it('returns empty array when no issues of that category', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Technical 1', 'TEST_CODE')

      const parsing = result.getIssuesByCategory(VALIDATION_CATEGORY.PARSING)

      expect(parsing).toHaveLength(0)
    })
  })

  describe('getIssuesByRow', () => {
    it('groups issues by row number', () => {
      const result = createValidationIssues()
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Error on row 5',
        'TEST_CODE',
        {
          location: { row: 5 }
        }
      )
      result.addWarning(
        VALIDATION_CATEGORY.BUSINESS,
        'Warning on row 5',
        'TEST_CODE',
        {
          location: { row: 5 }
        }
      )
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Error on row 10',
        'TEST_CODE',
        {
          location: { row: 10 }
        }
      )

      const byRow = result.getIssuesByRow()

      expect(byRow.size).toBe(2)
      expect(byRow.get(5)).toHaveLength(2)
      expect(byRow.get(10)).toHaveLength(1)
      expect(byRow.get(5)[0].message).toBe('Error on row 5')
      expect(byRow.get(5)[1].message).toBe('Warning on row 5')
      expect(byRow.get(10)[0].message).toBe('Error on row 10')
    })

    it('ignores issues without row context', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Global error', 'TEST_CODE')
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Error on row 5',
        'TEST_CODE',
        {
          location: { row: 5 }
        }
      )

      const byRow = result.getIssuesByRow()

      expect(byRow.size).toBe(1)
      expect(byRow.has(5)).toBe(true)
      expect(byRow.get(5)).toHaveLength(1)
    })

    it('returns empty map when no issues have row context', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Global error', 'TEST_CODE')

      const byRow = result.getIssuesByRow()

      expect(byRow.size).toBe(0)
    })

    it('returns empty map when there are no issues', () => {
      const result = createValidationIssues()

      const byRow = result.getIssuesByRow()

      expect(byRow.size).toBe(0)
    })
  })

  describe('groupBySeverity', () => {
    it('groups all issues by severity', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 1', 'TEST_CODE')
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 2', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 2', 'TEST_CODE')

      const grouped = result.groupBySeverity()

      expect(grouped[VALIDATION_SEVERITY.FATAL]).toHaveLength(2)
      expect(grouped[VALIDATION_SEVERITY.ERROR]).toHaveLength(1)
      expect(grouped[VALIDATION_SEVERITY.WARNING]).toHaveLength(2)
    })

    it('returns empty arrays for severities with no issues', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')

      const grouped = result.groupBySeverity()

      expect(grouped[VALIDATION_SEVERITY.FATAL]).toHaveLength(0)
      expect(grouped[VALIDATION_SEVERITY.ERROR]).toHaveLength(1)
      expect(grouped[VALIDATION_SEVERITY.WARNING]).toHaveLength(0)
    })
  })

  describe('getAllIssues', () => {
    it('returns all issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning', 'TEST_CODE')

      const all = result.getAllIssues()

      expect(all).toHaveLength(3)
    })

    it('returns a copy of the issues array', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error', 'TEST_CODE')

      const all = result.getAllIssues()
      all.push({
        severity: VALIDATION_SEVERITY.WARNING,
        category: VALIDATION_CATEGORY.BUSINESS,
        message: 'Added'
      })

      expect(result.getAllIssues()).toHaveLength(1)
    })

    it('returns empty array when there are no issues', () => {
      const result = createValidationIssues()

      expect(result.getAllIssues()).toHaveLength(0)
    })
  })

  describe('getCounts', () => {
    it('returns counts for all severity levels', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 1', 'TEST_CODE')
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 2', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 3', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1', 'TEST_CODE')

      const counts = result.getCounts()

      expect(counts).toEqual({
        fatal: 2,
        error: 3,
        warning: 1,
        total: 6
      })
    })

    it('returns zero counts when there are no issues', () => {
      const result = createValidationIssues()

      const counts = result.getCounts()

      expect(counts).toEqual({
        fatal: 0,
        error: 0,
        warning: 0,
        total: 0
      })
    })
  })

  describe('getSummary', () => {
    it('returns success message when there are no issues', () => {
      const result = createValidationIssues()

      expect(result.getSummary()).toBe('Validation passed with no issues')
    })

    it('returns summary with fatal count', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 1', 'TEST_CODE')
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 2', 'TEST_CODE')

      expect(result.getSummary()).toBe('Validation completed with 2 fatal')
    })

    it('returns summary with single error', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')

      expect(result.getSummary()).toBe('Validation completed with 1 error')
    })

    it('returns summary with multiple errors', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2', 'TEST_CODE')

      expect(result.getSummary()).toBe('Validation completed with 2 errors')
    })

    it('returns summary with single warning', () => {
      const result = createValidationIssues()
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1', 'TEST_CODE')

      expect(result.getSummary()).toBe('Validation completed with 1 warning')
    })

    it('returns summary with multiple warnings', () => {
      const result = createValidationIssues()
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 2', 'TEST_CODE')

      expect(result.getSummary()).toBe('Validation completed with 2 warnings')
    })

    it('returns summary with all severity types', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1', 'TEST_CODE')

      expect(result.getSummary()).toBe(
        'Validation completed with 1 fatal, 2 errors, 1 warning'
      )
    })

    it('returns summary with only fatal and errors', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal', 'TEST_CODE')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error', 'TEST_CODE')

      expect(result.getSummary()).toBe(
        'Validation completed with 1 fatal, 1 error'
      )
    })

    it('returns summary with only errors and warnings', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1', 'TEST_CODE')

      expect(result.getSummary()).toBe(
        'Validation completed with 1 error, 1 warning'
      )
    })
  })

  describe('context properties', () => {
    it('stores all context properties', () => {
      const result = createValidationIssues()
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Complex error',
        'TEST_CODE',
        {
          row: 42,
          field: 'TONNAGE',
          section: 'Section 1',
          value: 'invalid',
          reason: 'Must be a number'
        }
      )

      const issue = result.getAllIssues()[0]
      expect(issue.context.row).toBe(42)
      expect(issue.context.field).toBe('TONNAGE')
      expect(issue.context.section).toBe('Section 1')
      expect(issue.context.value).toBe('invalid')
      expect(issue.context.reason).toBe('Must be a number')
    })
  })

  describe('toErrorResponse', () => {
    it('returns empty issues array when no issues', () => {
      const result = createValidationIssues()
      const response = result.toErrorResponse()

      expect(response).toEqual({ issues: [] })
    })

    it('converts error with location to response format', () => {
      const result = createValidationIssues()
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Missing required field',
        'TEST_CODE',
        {
          location: {
            sheet: 'Received',
            row: 7,
            column: 'B',
            header: 'ROW_ID'
          },
          actual: null
        }
      )

      const response = result.toErrorResponse()

      expect(response.issues).toHaveLength(1)
      expect(response.issues[0]).toEqual({
        type: 'TECHNICAL_ERROR',
        meta: {
          location: {
            sheet: 'Received',
            row: 7,
            column: 'B',
            header: 'ROW_ID'
          },
          actual: null
        }
      })
    })

    it('converts multiple errors to response format', () => {
      const result = createValidationIssues()
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Missing reference',
        'TEST_CODE',
        {
          location: { row: 5, header: 'ROW_ID' }
        }
      )
      result.addWarning(
        VALIDATION_CATEGORY.BUSINESS,
        'Below threshold',
        'TEST_CODE',
        {
          location: { row: 10, header: 'TONNAGE' },
          actual: 0.001
        }
      )
      result.addFatal(
        VALIDATION_CATEGORY.PARSING,
        'Could not parse file',
        'TEST_CODE'
      )

      const response = result.toErrorResponse()

      expect(response.issues).toHaveLength(3)
      expect(response.issues[0].type).toBe('TECHNICAL_ERROR')
      expect(response.issues[1].type).toBe('BUSINESS_WARNING')
      expect(response.issues[2].type).toBe('PARSING_FATAL')
    })

    it('includes meta when context provided', () => {
      const result = createValidationIssues()
      result.addFatal(
        VALIDATION_CATEGORY.BUSINESS,
        'Processing type does not match',
        'TEST_CODE',
        {
          location: { field: 'PROCESSING_TYPE' },
          expected: 'REPROCESSOR_INPUT',
          actual: 'EXPORTER'
        }
      )

      const response = result.toErrorResponse()

      expect(response.issues[0]).toEqual({
        type: 'BUSINESS_FATAL',
        meta: {
          location: { field: 'PROCESSING_TYPE' },
          expected: 'REPROCESSOR_INPUT',
          actual: 'EXPORTER'
        }
      })
    })

    it('includes all context in meta', () => {
      const result = createValidationIssues()
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Value mismatch',
        'TEST_CODE',
        {
          location: { sheet: 'Sheet1', row: 6, column: 'C', header: 'TONNAGE' },
          expected: 10,
          actual: 5
        }
      )

      const response = result.toErrorResponse()

      expect(response.issues[0]).toEqual({
        type: 'TECHNICAL_ERROR',
        meta: {
          location: { sheet: 'Sheet1', row: 6, column: 'C', header: 'TONNAGE' },
          expected: 10,
          actual: 5
        }
      })
    })

    it('generates correct types for all severity/category combinations', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal parsing', 'TEST_CODE')
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Technical error',
        'TEST_CODE'
      )
      result.addWarning(
        VALIDATION_CATEGORY.BUSINESS,
        'Business warning',
        'TEST_CODE'
      )

      const response = result.toErrorResponse()

      expect(response.issues[0].type).toBe('PARSING_FATAL')
      expect(response.issues[1].type).toBe('TECHNICAL_ERROR')
      expect(response.issues[2].type).toBe('BUSINESS_WARNING')
    })

    it('handles empty context gracefully', () => {
      const result = createValidationIssues()
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Generic error',
        'TEST_CODE'
      )

      const response = result.toErrorResponse()

      expect(response.issues[0]).toEqual({
        type: 'TECHNICAL_ERROR'
      })
    })

    it('handles issues with explicitly null context', () => {
      const result = createValidationIssues()
      result.addIssue(
        VALIDATION_SEVERITY.FATAL,
        VALIDATION_CATEGORY.TECHNICAL,
        'System error',
        'TEST_CODE',
        null
      )

      const response = result.toErrorResponse()

      expect(response.issues).toHaveLength(1)
      expect(response.issues[0]).toEqual({
        type: 'TECHNICAL_FATAL'
      })
      expect(response.issues[0].meta).toBeUndefined()
    })
  })

  describe('issueToErrorObject', () => {
    it('transforms a domain issue to HTTP format', () => {
      const domainIssue = {
        severity: 'ERROR',
        category: 'TECHNICAL',
        message: 'Invalid value',
        context: {
          location: {
            sheet: 'Received',
            row: 9,
            column: 'B',
            header: 'ROW_ID'
          },
          actual: 9999
        }
      }

      const httpIssue = issueToErrorObject(domainIssue)

      expect(httpIssue).toEqual({
        type: 'TECHNICAL_ERROR',
        meta: {
          location: {
            sheet: 'Received',
            row: 9,
            column: 'B',
            header: 'ROW_ID'
          },
          actual: 9999
        }
      })
    })

    it('creates correct type from severity and category', () => {
      expect(
        issueToErrorObject({
          severity: 'FATAL',
          category: 'PARSING',
          message: 'Cannot parse'
        })
      ).toEqual({
        type: 'PARSING_FATAL'
      })

      expect(
        issueToErrorObject({
          severity: 'WARNING',
          category: 'BUSINESS',
          message: 'Low value',
          context: { field: 'TONNAGE' }
        })
      ).toEqual({
        type: 'BUSINESS_WARNING',
        meta: { field: 'TONNAGE' }
      })
    })

    it('includes all context fields in meta', () => {
      const httpIssue = issueToErrorObject({
        severity: 'ERROR',
        category: 'TECHNICAL',
        message: 'Invalid',
        context: {
          location: { header: 'FIELD' },
          actual: 'bad',
          expected: 'good'
        }
      })

      expect(httpIssue).toEqual({
        type: 'TECHNICAL_ERROR',
        meta: {
          location: { header: 'FIELD' },
          actual: 'bad',
          expected: 'good'
        }
      })
    })

    it('omits meta when context only contains undefined values', () => {
      const httpIssue = issueToErrorObject({
        severity: 'ERROR',
        category: 'TECHNICAL',
        message: 'Invalid',
        context: { field: undefined, value: undefined }
      })

      expect(httpIssue).toEqual({
        type: 'TECHNICAL_ERROR'
      })
      expect(httpIssue).not.toHaveProperty('meta')
    })
  })

  describe('merge', () => {
    it('merges issues from another ValidationResult', () => {
      const result1 = createValidationIssues()
      result1.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')

      const result2 = createValidationIssues()
      result2.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2', 'TEST_CODE')

      result1.merge(result2)

      expect(result1.getAllIssues()).toHaveLength(2)
      expect(result1.getAllIssues()[0].message).toBe('Error 1')
      expect(result1.getAllIssues()[1].message).toBe('Error 2')
    })

    it('returns this for chaining', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()
      const result3 = createValidationIssues()

      result1.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')
      result2.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2', 'TEST_CODE')
      result3.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 3', 'TEST_CODE')

      const returned = result1.merge(result2).merge(result3)

      expect(returned).toBe(result1)
      expect(result1.getAllIssues()).toHaveLength(3)
    })

    it('preserves all issue properties when merging', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()

      result2.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Missing field',
        'TEST_CODE',
        {
          location: { row: 5, field: 'PROCESSING_TYPE' }
        }
      )

      result1.merge(result2)

      const issue = result1.getAllIssues()[0]
      expect(issue.severity).toBe('error')
      expect(issue.category).toBe(VALIDATION_CATEGORY.TECHNICAL)
      expect(issue.message).toBe('Missing field')
      expect(issue.context.location.row).toBe(5)
      expect(issue.context.location.field).toBe('PROCESSING_TYPE')
    })

    it('merges empty result without errors', () => {
      const result1 = createValidationIssues()
      result1.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')

      const result2 = createValidationIssues()

      result1.merge(result2)

      expect(result1.getAllIssues()).toHaveLength(1)
    })

    it('merges into empty result', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()

      result2.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')

      result1.merge(result2)

      expect(result1.getAllIssues()).toHaveLength(1)
      expect(result1.getAllIssues()[0].message).toBe('Error 1')
    })

    it('preserves severity levels when merging', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()

      result2.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal', 'TEST_CODE')
      result2.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error', 'TEST_CODE')
      result2.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning', 'TEST_CODE')

      result1.merge(result2)

      expect(result1.isFatal()).toBe(true)
      expect(result1.isValid()).toBe(false)
      expect(result1.hasIssues()).toBe(true)
      expect(result1.getAllIssues()).toHaveLength(3)
    })

    it('throws TypeError when merging non-ValidationResult', () => {
      const result = createValidationIssues()

      expect(() => result.merge({})).toThrow(TypeError)
      expect(() => result.merge(null)).toThrow(TypeError)
      expect(() => result.merge([])).toThrow(TypeError)
      expect(() => result.merge('string')).toThrow(TypeError)
    })

    it('does not modify the source result being merged', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()

      result2.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1', 'TEST_CODE')

      result1.merge(result2)

      expect(result2.getAllIssues()).toHaveLength(1)
      expect(result1.getAllIssues()).toHaveLength(1)

      result1.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2', 'TEST_CODE')

      expect(result2.getAllIssues()).toHaveLength(1)
      expect(result1.getAllIssues()).toHaveLength(2)
    })
  })
})
