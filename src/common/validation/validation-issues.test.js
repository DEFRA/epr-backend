import {
  createValidationIssues,
  VALIDATION_SEVERITY,
  VALIDATION_CATEGORY
} from './validation-issues.js'

describe('Validation Issues', () => {
  describe('addIssue', () => {
    it('adds an issue with all properties', () => {
      const result = createValidationIssues()
      result.addIssue(
        VALIDATION_SEVERITY.ERROR,
        VALIDATION_CATEGORY.TECHNICAL,
        'Missing required field',
        { row: 5, field: 'SITE_NAME' }
      )

      expect(result.getAllIssues()).toHaveLength(1)
      expect(result.getAllIssues()[0]).toEqual({
        severity: VALIDATION_SEVERITY.ERROR,
        category: VALIDATION_CATEGORY.TECHNICAL,
        message: 'Missing required field',
        context: { row: 5, field: 'SITE_NAME' }
      })
    })

    it('adds an issue without context', () => {
      const result = createValidationIssues()
      result.addIssue(
        VALIDATION_SEVERITY.FATAL,
        VALIDATION_CATEGORY.PARSING,
        'Could not parse file'
      )

      expect(result.getAllIssues()).toHaveLength(1)
      expect(result.getAllIssues()[0].context).toEqual({})
    })

    it('returns this for chaining', () => {
      const result = createValidationIssues()
      const returned = result.addIssue(
        VALIDATION_SEVERITY.WARNING,
        VALIDATION_CATEGORY.BUSINESS,
        'Test'
      )

      expect(returned).toBe(result)
    })
  })

  describe('addFatal', () => {
    it('adds a fatal issue', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Could not locate marker', {
        marker: 'WASTE_REGISTRATION_NUMBER'
      })

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
      const returned = result.addFatal(VALIDATION_CATEGORY.PARSING, 'Test')

      expect(returned).toBe(result)
    })
  })

  describe('addError', () => {
    it('adds an error issue', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Invalid format', {
        row: 10,
        field: 'DATE'
      })

      expect(result.getAllIssues()).toHaveLength(1)
      expect(result.getAllIssues()[0].severity).toBe(VALIDATION_SEVERITY.ERROR)
      expect(result.getAllIssues()[0].category).toBe(
        VALIDATION_CATEGORY.TECHNICAL
      )
    })

    it('returns this for chaining', () => {
      const result = createValidationIssues()
      const returned = result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Test')

      expect(returned).toBe(result)
    })
  })

  describe('addWarning', () => {
    it('adds a warning issue', () => {
      const result = createValidationIssues()
      result.addWarning(
        VALIDATION_CATEGORY.BUSINESS,
        'Load will not be added to balance',
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
      const returned = result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Test')

      expect(returned).toBe(result)
    })
  })

  describe('chaining', () => {
    it('allows method chaining', () => {
      const result = createValidationIssues()
        .addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal error')
        .addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')
        .addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2')
        .addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1')

      expect(result.getAllIssues()).toHaveLength(4)
    })
  })

  describe('isFatal', () => {
    it('returns true when there is a fatal issue', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal error')

      expect(result.isFatal()).toBe(true)
    })

    it('returns true when there are multiple fatal issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal error 1')
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal error 2')

      expect(result.isFatal()).toBe(true)
    })

    it('returns true when there are fatal and non-fatal issues', () => {
      const result = createValidationIssues()
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning')
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal error')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error')

      expect(result.isFatal()).toBe(true)
    })

    it('returns false when there are no fatal issues', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning')

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
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 2')

      expect(result.isValid()).toBe(true)
    })

    it('returns false when there is a fatal issue', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal error')

      expect(result.isValid()).toBe(false)
    })

    it('returns false when there is an error issue', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error')

      expect(result.isValid()).toBe(false)
    })

    it('returns false when there are errors and warnings', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning')

      expect(result.isValid()).toBe(false)
    })

    it('returns false when there are fatal, error, and warning issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning')

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
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning')

      expect(result.hasIssues()).toBe(true)
    })

    it('returns true for any type of issue', () => {
      const resultFatal = createValidationIssues().addFatal(
        VALIDATION_CATEGORY.PARSING,
        'Fatal'
      )
      const resultError = createValidationIssues().addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Error'
      )
      const resultWarning = createValidationIssues().addWarning(
        VALIDATION_CATEGORY.BUSINESS,
        'Warning'
      )

      expect(resultFatal.hasIssues()).toBe(true)
      expect(resultError.hasIssues()).toBe(true)
      expect(resultWarning.hasIssues()).toBe(true)
    })
  })

  describe('getIssuesBySeverity', () => {
    it('returns only fatal issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 1')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 2')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1')

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)

      expect(fatals).toHaveLength(2)
      expect(fatals[0].message).toBe('Fatal 1')
      expect(fatals[1].message).toBe('Fatal 2')
    })

    it('returns only error issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 1')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1')

      const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)

      expect(errors).toHaveLength(2)
      expect(errors[0].message).toBe('Error 1')
      expect(errors[1].message).toBe('Error 2')
    })

    it('returns only warning issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 1')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 2')

      const warnings = result.getIssuesBySeverity(VALIDATION_SEVERITY.WARNING)

      expect(warnings).toHaveLength(2)
      expect(warnings[0].message).toBe('Warning 1')
      expect(warnings[1].message).toBe('Warning 2')
    })

    it('returns empty array when no issues of that severity', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)

      expect(fatals).toHaveLength(0)
    })
  })

  describe('getIssuesByCategory', () => {
    it('returns only parsing issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Parsing 1')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Technical 1')
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Parsing 2')

      const parsing = result.getIssuesByCategory(VALIDATION_CATEGORY.PARSING)

      expect(parsing).toHaveLength(2)
      expect(parsing[0].message).toBe('Parsing 1')
      expect(parsing[1].message).toBe('Parsing 2')
    })

    it('returns only technical issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Parsing 1')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Technical 1')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Technical 2')

      const technical = result.getIssuesByCategory(
        VALIDATION_CATEGORY.TECHNICAL
      )

      expect(technical).toHaveLength(2)
      expect(technical[0].message).toBe('Technical 1')
      expect(technical[1].message).toBe('Technical 2')
    })

    it('returns only business issues', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Technical 1')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Business 1')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Business 2')

      const business = result.getIssuesByCategory(VALIDATION_CATEGORY.BUSINESS)

      expect(business).toHaveLength(2)
      expect(business[0].message).toBe('Business 1')
      expect(business[1].message).toBe('Business 2')
    })

    it('returns empty array when no issues of that category', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Technical 1')

      const parsing = result.getIssuesByCategory(VALIDATION_CATEGORY.PARSING)

      expect(parsing).toHaveLength(0)
    })
  })

  describe('getIssuesByRow', () => {
    it('groups issues by row number', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error on row 5', {
        row: 5
      })
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning on row 5', {
        row: 5
      })
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error on row 10', {
        row: 10
      })

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
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Global error')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error on row 5', {
        row: 5
      })

      const byRow = result.getIssuesByRow()

      expect(byRow.size).toBe(1)
      expect(byRow.has(5)).toBe(true)
      expect(byRow.get(5)).toHaveLength(1)
    })

    it('returns empty map when no issues have row context', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Global error')

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
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 1')
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 2')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 2')

      const grouped = result.groupBySeverity()

      expect(grouped[VALIDATION_SEVERITY.FATAL]).toHaveLength(2)
      expect(grouped[VALIDATION_SEVERITY.ERROR]).toHaveLength(1)
      expect(grouped[VALIDATION_SEVERITY.WARNING]).toHaveLength(2)
    })

    it('returns empty arrays for severities with no issues', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')

      const grouped = result.groupBySeverity()

      expect(grouped[VALIDATION_SEVERITY.FATAL]).toHaveLength(0)
      expect(grouped[VALIDATION_SEVERITY.ERROR]).toHaveLength(1)
      expect(grouped[VALIDATION_SEVERITY.WARNING]).toHaveLength(0)
    })
  })

  describe('getAllIssues', () => {
    it('returns all issues', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning')

      const all = result.getAllIssues()

      expect(all).toHaveLength(3)
    })

    it('returns a copy of the issues array', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error')

      const all = result.getAllIssues()
      all.push({
        severity: VALIDATION_SEVERITY.WARNING,
        category: VALIDATION_CATEGORY.BUSINESS,
        message: 'Added',
        context: {}
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
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 1')
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 2')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 3')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1')

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
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 1')
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal 2')

      expect(result.getSummary()).toBe('Validation completed with 2 fatal')
    })

    it('returns summary with single error', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')

      expect(result.getSummary()).toBe('Validation completed with 1 error')
    })

    it('returns summary with multiple errors', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2')

      expect(result.getSummary()).toBe('Validation completed with 2 errors')
    })

    it('returns summary with single warning', () => {
      const result = createValidationIssues()
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1')

      expect(result.getSummary()).toBe('Validation completed with 1 warning')
    })

    it('returns summary with multiple warnings', () => {
      const result = createValidationIssues()
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 2')

      expect(result.getSummary()).toBe('Validation completed with 2 warnings')
    })

    it('returns summary with all severity types', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1')

      expect(result.getSummary()).toBe(
        'Validation completed with 1 fatal, 2 errors, 1 warning'
      )
    })

    it('returns summary with only fatal and errors', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error')

      expect(result.getSummary()).toBe(
        'Validation completed with 1 fatal, 1 error'
      )
    })

    it('returns summary with only errors and warnings', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning 1')

      expect(result.getSummary()).toBe(
        'Validation completed with 1 error, 1 warning'
      )
    })
  })

  describe('context properties', () => {
    it('stores all context properties', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Complex error', {
        row: 42,
        field: 'TONNAGE',
        section: 'Section 1',
        value: 'invalid',
        reason: 'Must be a number'
      })

      const issue = result.getAllIssues()[0]
      expect(issue.context.row).toBe(42)
      expect(issue.context.field).toBe('TONNAGE')
      expect(issue.context.section).toBe('Section 1')
      expect(issue.context.value).toBe('invalid')
      expect(issue.context.reason).toBe('Must be a number')
    })
  })

  describe('toErrorResponse', () => {
    it('returns empty errors array when no issues', () => {
      const result = createValidationIssues()
      const response = result.toErrorResponse()

      expect(response).toEqual({ errors: [] })
    })

    it('converts single error to response format', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Missing required field', {
        row: 5,
        field: 'SITE_NAME',
        section: 'Section 1'
      })

      const response = result.toErrorResponse()

      expect(response.errors).toHaveLength(1)
      expect(response.errors[0]).toEqual({
        code: 'TECHNICAL_ERROR',
        source: { pointer: '/data/rows/4/SITE_NAME' },
        meta: { row: 5, field: 'SITE_NAME', section: 'Section 1' }
      })
    })

    it('converts multiple errors to response format', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Missing site name', {
        row: 5,
        field: 'SITE_NAME'
      })
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Below threshold', {
        row: 10,
        field: 'TONNAGE',
        value: 0.001
      })
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Could not parse file')

      const response = result.toErrorResponse()

      expect(response.errors).toHaveLength(3)
      expect(response.errors[0].code).toBe('TECHNICAL_ERROR')
      expect(response.errors[1].code).toBe('BUSINESS_WARNING')
      expect(response.errors[2].code).toBe('PARSING_FATAL')
    })

    it('converts row number to 0-based index in pointer', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error in row 1', {
        row: 1,
        field: 'FIELD'
      })

      const response = result.toErrorResponse()

      expect(response.errors[0].source.pointer).toBe('/data/rows/0/FIELD')
    })

    it('omits source when no row or field context', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Could not locate marker', {
        marker: 'WASTE_REGISTRATION_NUMBER'
      })

      const response = result.toErrorResponse()

      expect(response.errors[0]).not.toHaveProperty('source')
      expect(response.errors[0].meta).toEqual({
        marker: 'WASTE_REGISTRATION_NUMBER'
      })
    })

    it('builds pointer with only row when field is missing', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.BUSINESS, 'Row has issues', {
        row: 15,
        reason: 'Multiple missing fields'
      })

      const response = result.toErrorResponse()

      expect(response.errors[0].source.pointer).toBe('/data/rows/14')
    })

    it('builds pointer with only field when row is missing', () => {
      const result = createValidationIssues()
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Invalid registration number',
        {
          field: 'WASTE_REGISTRATION_NUMBER'
        }
      )

      const response = result.toErrorResponse()

      expect(response.errors[0].source.pointer).toBe(
        '/data/WASTE_REGISTRATION_NUMBER'
      )
    })

    it('handles nested field paths with dots', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Missing nested field', {
        field: 'meta.WASTE_REGISTRATION_NUMBER'
      })

      const response = result.toErrorResponse()

      expect(response.errors[0].source.pointer).toBe(
        '/data/meta/WASTE_REGISTRATION_NUMBER'
      )
    })

    it('handles nested field paths with row', () => {
      const result = createValidationIssues()
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Missing nested field in row',
        {
          row: 5,
          field: 'details.siteName'
        }
      )

      const response = result.toErrorResponse()

      expect(response.errors[0].source.pointer).toBe(
        '/data/rows/4/details/siteName'
      )
    })

    it('handles deeply nested field paths', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Deep nesting', {
        field: 'level1.level2.level3.field'
      })

      const response = result.toErrorResponse()

      expect(response.errors[0].source.pointer).toBe(
        '/data/level1/level2/level3/field'
      )
    })

    it('includes all context in meta', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Value mismatch', {
        row: 5,
        field: 'TONNAGE',
        expected: 10,
        actual: 5,
        section: 'Section 2'
      })

      const response = result.toErrorResponse()

      expect(response.errors[0].meta).toEqual({
        row: 5,
        field: 'TONNAGE',
        expected: 10,
        actual: 5,
        section: 'Section 2'
      })
    })

    it('generates correct codes for all severity/category combinations', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal parsing')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Technical error')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Business warning')

      const response = result.toErrorResponse()

      expect(response.errors[0].code).toBe('PARSING_FATAL')
      expect(response.errors[1].code).toBe('TECHNICAL_ERROR')
      expect(response.errors[2].code).toBe('BUSINESS_WARNING')
    })

    it('handles empty context gracefully', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Generic error')

      const response = result.toErrorResponse()

      expect(response.errors[0]).toEqual({
        code: 'TECHNICAL_ERROR'
      })
    })

    it('uses custom error code when provided', () => {
      const result = createValidationIssues()
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Missing required field',
        { row: 5, field: 'SITE_NAME' },
        'MISSING_REQUIRED_FIELD'
      )

      const response = result.toErrorResponse()

      expect(response.errors[0].code).toBe('MISSING_REQUIRED_FIELD')
    })

    it('uses multiple custom codes', () => {
      const result = createValidationIssues()
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Missing site name',
        { row: 5, field: 'SITE_NAME' },
        'MISSING_REQUIRED_FIELD'
      )
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Invalid material',
        { row: 10, field: 'MATERIAL' },
        'INVALID_MATERIAL_TYPE'
      )
      result.addWarning(
        VALIDATION_CATEGORY.BUSINESS,
        'Below threshold',
        { row: 15, field: 'TONNAGE' },
        'TONNAGE_BELOW_THRESHOLD'
      )

      const response = result.toErrorResponse()

      expect(response.errors[0].code).toBe('MISSING_REQUIRED_FIELD')
      expect(response.errors[1].code).toBe('INVALID_MATERIAL_TYPE')
      expect(response.errors[2].code).toBe('TONNAGE_BELOW_THRESHOLD')
    })

    it('falls back to generated code when custom code not provided', () => {
      const result = createValidationIssues()
      result.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Some error',
        { field: 'TEST' },
        'CUSTOM_CODE'
      )
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Another error', {
        field: 'OTHER'
      })

      const response = result.toErrorResponse()

      expect(response.errors[0].code).toBe('CUSTOM_CODE')
      expect(response.errors[1].code).toBe('TECHNICAL_ERROR')
    })

    it('supports custom codes with fatal errors', () => {
      const result = createValidationIssues()
      result.addFatal(
        VALIDATION_CATEGORY.PARSING,
        'Marker not found',
        { marker: 'WASTE_REGISTRATION_NUMBER' },
        'MARKER_NOT_FOUND'
      )

      const response = result.toErrorResponse()

      expect(response.errors[0].code).toBe('MARKER_NOT_FOUND')
    })

    it('handles issues with explicitly null context', () => {
      const result = createValidationIssues()
      result.addIssue(
        VALIDATION_SEVERITY.FATAL,
        VALIDATION_CATEGORY.TECHNICAL,
        'System error',
        null
      )

      const response = result.toErrorResponse()

      expect(response.errors).toHaveLength(1)
      expect(response.errors[0]).toEqual({
        code: 'TECHNICAL_FATAL'
      })
      expect(response.errors[0].source).toBeUndefined()
      expect(response.errors[0].meta).toBeUndefined()
    })
  })

  describe('merge', () => {
    it('merges issues from another ValidationResult', () => {
      const result1 = createValidationIssues()
      result1.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')

      const result2 = createValidationIssues()
      result2.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2')

      result1.merge(result2)

      expect(result1.getAllIssues()).toHaveLength(2)
      expect(result1.getAllIssues()[0].message).toBe('Error 1')
      expect(result1.getAllIssues()[1].message).toBe('Error 2')
    })

    it('returns this for chaining', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()
      const result3 = createValidationIssues()

      result1.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')
      result2.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2')
      result3.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 3')

      const returned = result1.merge(result2).merge(result3)

      expect(returned).toBe(result1)
      expect(result1.getAllIssues()).toHaveLength(3)
    })

    it('preserves all issue properties including custom codes', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()

      result2.addError(
        VALIDATION_CATEGORY.TECHNICAL,
        'Missing field',
        { row: 5, field: 'SITE_NAME' },
        'MISSING_REQUIRED_FIELD'
      )

      result1.merge(result2)

      const issue = result1.getAllIssues()[0]
      expect(issue.severity).toBe('error')
      expect(issue.category).toBe(VALIDATION_CATEGORY.TECHNICAL)
      expect(issue.message).toBe('Missing field')
      expect(issue.code).toBe('MISSING_REQUIRED_FIELD')
      expect(issue.context.row).toBe(5)
      expect(issue.context.field).toBe('SITE_NAME')
    })

    it('merges empty result without errors', () => {
      const result1 = createValidationIssues()
      result1.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')

      const result2 = createValidationIssues()

      result1.merge(result2)

      expect(result1.getAllIssues()).toHaveLength(1)
    })

    it('merges into empty result', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()

      result2.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')

      result1.merge(result2)

      expect(result1.getAllIssues()).toHaveLength(1)
      expect(result1.getAllIssues()[0].message).toBe('Error 1')
    })

    it('preserves severity levels when merging', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()

      result2.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal')
      result2.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error')
      result2.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning')

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

      result2.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')

      result1.merge(result2)

      expect(result2.getAllIssues()).toHaveLength(1)
      expect(result1.getAllIssues()).toHaveLength(1)

      result1.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2')

      expect(result2.getAllIssues()).toHaveLength(1)
      expect(result1.getAllIssues()).toHaveLength(2)
    })
  })

  describe('getSummaryMetadata', () => {
    it('returns empty metadata when there are no issues', () => {
      const result = createValidationIssues()

      expect(result.getSummaryMetadata()).toEqual({
        totalIssues: 0,
        issuesBySeverity: {
          fatal: 0,
          error: 0,
          warning: 0
        },
        rowsWithIssues: 0,
        firstIssueRow: null,
        lastIssueRow: null
      })
    })

    it('returns metadata with issue counts', () => {
      const result = createValidationIssues()
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2')
      result.addWarning(VALIDATION_CATEGORY.BUSINESS, 'Warning')

      const metadata = result.getSummaryMetadata()

      expect(metadata.totalIssues).toBe(4)
      expect(metadata.issuesBySeverity).toEqual({
        fatal: 1,
        error: 2,
        warning: 1
      })
    })

    it('tracks rows with issues when context includes row numbers', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error in row 5', {
        row: 5
      })
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error in row 10', {
        row: 10
      })
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Another error in row 5', {
        row: 5
      })

      const metadata = result.getSummaryMetadata()

      expect(metadata.rowsWithIssues).toBe(2)
      expect(metadata.firstIssueRow).toBe(5)
      expect(metadata.lastIssueRow).toBe(10)
    })

    it('handles non-sequential row numbers correctly', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error in row 15', {
        row: 15
      })
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error in row 3', {
        row: 3
      })
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error in row 8', {
        row: 8
      })

      const metadata = result.getSummaryMetadata()

      expect(metadata.rowsWithIssues).toBe(3)
      expect(metadata.firstIssueRow).toBe(3)
      expect(metadata.lastIssueRow).toBe(15)
    })

    it('ignores issues without row context', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error with row', {
        row: 5
      })
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error without row')
      result.addFatal(VALIDATION_CATEGORY.PARSING, 'Fatal without row')

      const metadata = result.getSummaryMetadata()

      expect(metadata.totalIssues).toBe(3)
      expect(metadata.rowsWithIssues).toBe(1)
      expect(metadata.firstIssueRow).toBe(5)
      expect(metadata.lastIssueRow).toBe(5)
    })

    it('returns null for row bounds when no issues have row context', () => {
      const result = createValidationIssues()
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 1')
      result.addError(VALIDATION_CATEGORY.TECHNICAL, 'Error 2')

      const metadata = result.getSummaryMetadata()

      expect(metadata.rowsWithIssues).toBe(0)
      expect(metadata.firstIssueRow).toBeNull()
      expect(metadata.lastIssueRow).toBeNull()
    })
  })
})
