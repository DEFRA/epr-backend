import {
  createValidationIssues,
  issueToErrorObject
} from './validation-issues.js'
import { cellIssue, fileIssue, metaIssue } from './validation-issue-kinds.js'
import {
  VALIDATION_SEVERITY,
  VALIDATION_CATEGORY
} from '#common/enums/validation.js'

/** @import {ValidationCategory, ValidationCode, ValidationSeverity} from '#common/enums/validation.js' */
/** @import {TableCellLocation} from './validation-issue-kinds.js' */
/** @import {ValidationIssue} from './validation-issues.js' */

/** @type {TableCellLocation} */
const TEST_CELL = {
  sheet: 'Received',
  table: 'RECEIVED_LOADS',
  row: 2,
  column: 'A',
  header: 'ROW_ID'
}

/**
 * An issue at a cell, the only kind that can be less than fatal.
 *
 * @param {ValidationSeverity} severity
 * @param {string} message
 * @param {{ category?: ValidationCategory, code?: ValidationCode, location?: TableCellLocation, [extra: string]: unknown }} [details]
 * @returns {ValidationIssue}
 */
const anIssue = (
  severity,
  message,
  {
    category = VALIDATION_CATEGORY.TECHNICAL,
    code = 'MUST_BE_A_NUMBER',
    location = TEST_CELL,
    ...extras
  } = {}
) => cellIssue({ severity, category, message, code, location, ...extras })

describe('Validation Issues', () => {
  describe('createValidationIssues seeding', () => {
    /** @type {ValidationIssue[]} */
    const seed = [
      anIssue(VALIDATION_SEVERITY.FATAL, 'Seeded fatal'),
      anIssue(VALIDATION_SEVERITY.WARNING, 'Seeded warning', {
        category: VALIDATION_CATEGORY.BUSINESS
      })
    ]

    it('should seed the collector with the provided issues', () => {
      const result = createValidationIssues(seed)

      expect(result.getAllIssues()).toEqual(seed)
      expect(result.getCounts()).toMatchObject({
        fatal: 1,
        warning: 1,
        total: 2
      })
      expect(result.isFatal()).toBe(true)
    })

    it('should copy the seed so later mutations do not leak in', () => {
      const initial = [...seed]
      const result = createValidationIssues(initial)

      initial.push(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Added after construction')
      )

      expect(result.getAllIssues()).toHaveLength(2)
    })

    it('should keep adding issues on top of the seed', () => {
      const result = createValidationIssues(seed)

      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Added later', {
          category: VALIDATION_CATEGORY.BUSINESS
        })
      )

      expect(result.getAllIssues()).toHaveLength(3)
    })

    it('should default to an empty collector when no seed is given', () => {
      const result = createValidationIssues()

      expect(result.getAllIssues()).toEqual([])
    })
  })

  describe('isFatal', () => {
    it('returns true when there is a fatal issue', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal error', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.isFatal()).toBe(true)
    })

    it('returns true when there are multiple fatal issues', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal error 2', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.isFatal()).toBe(true)
    })

    it('returns true when there are fatal and non-fatal issues', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal error', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.isFatal()).toBe(true)
    })

    it('returns false when there are no fatal issues', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

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
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 1', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 2', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.isValid()).toBe(true)
    })

    it('returns false when there is a fatal issue', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal error', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.isValid()).toBe(false)
    })

    it('returns false when there is an error issue', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.isValid()).toBe(false)
    })

    it('returns false when there are errors and warnings', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.isValid()).toBe(false)
    })

    it('returns false when there are fatal, error, and warning issues', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

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
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.hasIssues()).toBe(true)
    })

    it('returns true for any type of issue', () => {
      const resultFatal = createValidationIssues().add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      const resultError = createValidationIssues().add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      const resultWarning = createValidationIssues().add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(resultFatal.hasIssues()).toBe(true)
      expect(resultError.hasIssues()).toBe(true)
      expect(resultWarning.hasIssues()).toBe(true)
    })
  })

  describe('getIssuesBySeverity', () => {
    it('returns only fatal issues', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal 2', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 1', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)

      expect(fatals).toHaveLength(2)
      expect(fatals[0].message).toBe('Fatal 1')
      expect(fatals[1].message).toBe('Fatal 2')
    })

    it('returns only error issues', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 2', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 1', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)

      expect(errors).toHaveLength(2)
      expect(errors[0].message).toBe('Error 1')
      expect(errors[1].message).toBe('Error 2')
    })

    it('returns only warning issues', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 1', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 2', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const warnings = result.getIssuesBySeverity(VALIDATION_SEVERITY.WARNING)

      expect(warnings).toHaveLength(2)
      expect(warnings[0].message).toBe('Warning 1')
      expect(warnings[1].message).toBe('Warning 2')
    })

    it('returns empty array when no issues of that severity', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)

      expect(fatals).toHaveLength(0)
    })
  })

  describe('getIssuesByCategory', () => {
    it('returns only technical issues', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Technical 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Business 1', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Technical 2', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const technical = result.getIssuesByCategory(
        VALIDATION_CATEGORY.TECHNICAL
      )

      expect(technical).toHaveLength(2)
      expect(technical[0].message).toBe('Technical 1')
      expect(technical[1].message).toBe('Technical 2')
    })

    it('returns only business issues', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Technical 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Business 1', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Business 2', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const business = result.getIssuesByCategory(VALIDATION_CATEGORY.BUSINESS)

      expect(business).toHaveLength(2)
      expect(business[0].message).toBe('Business 1')
      expect(business[1].message).toBe('Business 2')
    })

    it('returns empty array when no issues of that category', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Technical 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const business = result.getIssuesByCategory(VALIDATION_CATEGORY.BUSINESS)

      expect(business).toHaveLength(0)
    })
  })

  describe('groupBySeverity', () => {
    it('groups all issues by severity', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal 2', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 1', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 2', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const grouped = result.groupBySeverity()

      expect(grouped[VALIDATION_SEVERITY.FATAL]).toHaveLength(2)
      expect(grouped[VALIDATION_SEVERITY.ERROR]).toHaveLength(1)
      expect(grouped[VALIDATION_SEVERITY.WARNING]).toHaveLength(2)
    })

    it('returns empty arrays for severities with no issues', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const grouped = result.groupBySeverity()

      expect(grouped[VALIDATION_SEVERITY.FATAL]).toHaveLength(0)
      expect(grouped[VALIDATION_SEVERITY.ERROR]).toHaveLength(1)
      expect(grouped[VALIDATION_SEVERITY.WARNING]).toHaveLength(0)
    })
  })

  describe('getAllIssues', () => {
    it('returns all issues', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const all = result.getAllIssues()

      expect(all).toHaveLength(3)
    })

    it('returns a copy of the issues array', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const all = result.getAllIssues()
      all.push(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Added', {
          category: VALIDATION_CATEGORY.BUSINESS
        })
      )

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
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal 2', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 2', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 3', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 1', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

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
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal 2', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.getSummary()).toBe('Validation completed with 2 fatal')
    })

    it('returns summary with single error', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.getSummary()).toBe('Validation completed with 1 error')
    })

    it('returns summary with multiple errors', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 2', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.getSummary()).toBe('Validation completed with 2 errors')
    })

    it('returns summary with single warning', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 1', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.getSummary()).toBe('Validation completed with 1 warning')
    })

    it('returns summary with multiple warnings', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 1', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 2', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.getSummary()).toBe('Validation completed with 2 warnings')
    })

    it('returns summary with all severity types', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 2', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 1', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.getSummary()).toBe(
        'Validation completed with 1 fatal, 2 errors, 1 warning'
      )
    })

    it('returns summary with only fatal and errors', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.getSummary()).toBe(
        'Validation completed with 1 fatal, 1 error'
      )
    })

    it('returns summary with only errors and warnings', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 1', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result.getSummary()).toBe(
        'Validation completed with 1 error, 1 warning'
      )
    })
  })

  describe('context properties', () => {
    it('stores all context properties', () => {
      const result = createValidationIssues()
      result.add(
        fileIssue({
          category: VALIDATION_CATEGORY.TECHNICAL,
          message: 'Complex error',
          code: 'MUST_BE_A_NUMBER',
          row: 42,
          field: 'TONNAGE',
          section: 'Section 1',
          value: 'invalid',
          reason: 'Must be a number'
        })
      )

      const issue = result.getAllIssues()[0]
      expect(issue.context).toEqual({
        row: 42,
        field: 'TONNAGE',
        section: 'Section 1',
        value: 'invalid',
        reason: 'Must be a number'
      })
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
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Missing required field', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER',
          location: {
            sheet: 'Received',
            table: 'RECEIVED_LOADS',
            row: 7,
            column: 'B',
            header: 'ROW_ID'
          },
          actual: null
        })
      )

      const response = result.toErrorResponse()

      expect(response.issues).toHaveLength(1)
      expect(response.issues[0]).toEqual({
        type: 'TECHNICAL_ERROR',
        meta: {
          location: {
            sheet: 'Received',
            table: 'RECEIVED_LOADS',
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
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Missing reference', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER',
          location: { ...TEST_CELL, row: 5, header: 'ROW_ID' }
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Below threshold', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER',
          location: { ...TEST_CELL, row: 10, header: 'TONNAGE' },
          actual: 0.001
        })
      )
      result.add(
        fileIssue({
          category: VALIDATION_CATEGORY.TECHNICAL,
          message: 'Could not parse file',
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const response = result.toErrorResponse()

      expect(response.issues).toHaveLength(3)
      expect(response.issues[0].type).toBe('TECHNICAL_ERROR')
      expect(response.issues[1].type).toBe('BUSINESS_WARNING')
      expect(response.issues[2].type).toBe('TECHNICAL_FATAL')
    })

    it('includes meta when context provided', () => {
      const result = createValidationIssues()
      result.add(
        metaIssue({
          category: VALIDATION_CATEGORY.BUSINESS,
          message: 'Processing type does not match',
          code: 'MUST_BE_A_NUMBER',
          location: { field: 'PROCESSING_TYPE' },
          expected: 'REPROCESSOR_INPUT',
          actual: 'EXPORTER'
        })
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
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Value mismatch', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER',
          location: {
            sheet: 'Sheet1',
            table: 'RECEIVED_LOADS',
            row: 6,
            column: 'C',
            header: 'TONNAGE'
          },
          expected: 10,
          actual: 5
        })
      )

      const response = result.toErrorResponse()

      expect(response.issues[0]).toEqual({
        type: 'TECHNICAL_ERROR',
        meta: {
          location: {
            sheet: 'Sheet1',
            table: 'RECEIVED_LOADS',
            row: 6,
            column: 'C',
            header: 'TONNAGE'
          },
          expected: 10,
          actual: 5
        }
      })
    })

    it('generates correct types for all severity/category combinations', () => {
      const result = createValidationIssues()
      result.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal technical', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Technical error', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Business warning', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const response = result.toErrorResponse()

      expect(response.issues[0].type).toBe('TECHNICAL_FATAL')
      expect(response.issues[1].type).toBe('TECHNICAL_ERROR')
      expect(response.issues[2].type).toBe('BUSINESS_WARNING')
    })

    it('handles empty context gracefully', () => {
      const result = createValidationIssues()
      result.add(
        fileIssue({
          category: VALIDATION_CATEGORY.TECHNICAL,
          message: 'Generic error',
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const response = result.toErrorResponse()

      expect(response.issues[0]).toEqual({
        type: 'TECHNICAL_FATAL'
      })
    })
  })

  describe('issueToErrorObject', () => {
    it('transforms a domain issue to HTTP format', () => {
      const location = { ...TEST_CELL, row: 9 }

      const httpIssue = issueToErrorObject(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Invalid value', {
          location,
          actual: 9999
        })
      )

      expect(httpIssue).toEqual({
        type: 'TECHNICAL_ERROR',
        meta: { location, actual: 9999 }
      })
    })

    it('creates correct type from severity and category', () => {
      expect(
        issueToErrorObject(
          fileIssue({
            category: VALIDATION_CATEGORY.TECHNICAL,
            message: 'Cannot parse',
            code: 'MUST_BE_A_NUMBER'
          })
        )
      ).toEqual({
        type: 'TECHNICAL_FATAL'
      })

      expect(
        issueToErrorObject(
          anIssue(VALIDATION_SEVERITY.WARNING, 'Low value', {
            category: VALIDATION_CATEGORY.BUSINESS
          })
        )
      ).toMatchObject({ type: 'BUSINESS_WARNING' })
    })

    it('includes all context fields in meta', () => {
      const httpIssue = issueToErrorObject(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Invalid', {
          actual: 'bad',
          expected: 'good'
        })
      )

      expect(httpIssue).toEqual({
        type: 'TECHNICAL_ERROR',
        meta: { location: TEST_CELL, actual: 'bad', expected: 'good' }
      })
    })

    it('omits meta when context only contains undefined values', () => {
      const httpIssue = issueToErrorObject(
        fileIssue({
          category: VALIDATION_CATEGORY.TECHNICAL,
          message: 'Invalid',
          code: 'MUST_BE_A_NUMBER',
          field: undefined,
          value: undefined
        })
      )

      expect(httpIssue).toEqual({
        type: 'TECHNICAL_FATAL'
      })
      expect(httpIssue).not.toHaveProperty('meta')
    })
  })

  describe('merge', () => {
    it('merges issues from another ValidationResult', () => {
      const result1 = createValidationIssues()
      result1.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const result2 = createValidationIssues()
      result2.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 2', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      result1.merge(result2)

      expect(result1.getAllIssues()).toHaveLength(2)
      expect(result1.getAllIssues()[0].message).toBe('Error 1')
      expect(result1.getAllIssues()[1].message).toBe('Error 2')
    })

    it('returns this for chaining', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()
      const result3 = createValidationIssues()

      result1.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result2.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 2', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result3.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 3', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const returned = result1.merge(result2).merge(result3)

      expect(returned).toBe(result1)
      expect(result1.getAllIssues()).toHaveLength(3)
    })

    it('merges empty result without errors', () => {
      const result1 = createValidationIssues()
      result1.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      const result2 = createValidationIssues()

      result1.merge(result2)

      expect(result1.getAllIssues()).toHaveLength(1)
    })

    it('merges into empty result', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()

      result2.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      result1.merge(result2)

      expect(result1.getAllIssues()).toHaveLength(1)
      expect(result1.getAllIssues()[0].message).toBe('Error 1')
    })

    it('preserves severity levels when merging', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()

      result2.add(
        anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result2.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )
      result2.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning', {
          category: VALIDATION_CATEGORY.BUSINESS,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      result1.merge(result2)

      expect(result1.isFatal()).toBe(true)
      expect(result1.isValid()).toBe(false)
      expect(result1.hasIssues()).toBe(true)
      expect(result1.getAllIssues()).toHaveLength(3)
    })

    it('throws TypeError when merging non-ValidationResult', () => {
      const result = createValidationIssues()

      // @ts-expect-error -- {} is not a collector; testing the runtime guard
      expect(() => result.merge({})).toThrow(TypeError)
      // @ts-expect-error -- null is not a collector; testing the runtime guard
      expect(() => result.merge(null)).toThrow(TypeError)
      // @ts-expect-error -- [] is not a collector; testing the runtime guard
      expect(() => result.merge([])).toThrow(TypeError)
      // @ts-expect-error -- string is not a collector; testing the runtime guard
      expect(() => result.merge('string')).toThrow(TypeError)
    })

    it('does not modify the source result being merged', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()

      result2.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      result1.merge(result2)

      expect(result2.getAllIssues()).toHaveLength(1)
      expect(result1.getAllIssues()).toHaveLength(1)

      result1.add(
        anIssue(VALIDATION_SEVERITY.ERROR, 'Error 2', {
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'MUST_BE_A_NUMBER'
        })
      )

      expect(result2.getAllIssues()).toHaveLength(1)
      expect(result1.getAllIssues()).toHaveLength(2)
    })
  })

  describe('add', () => {
    const issue = fileIssue({
      category: 'technical',
      message: 'Spreadsheet buffer is empty',
      code: 'SPREADSHEET_INVALID_ERROR'
    })

    it('should add the issue as it was built', () => {
      const issues = createValidationIssues().add(issue)

      expect(issues.getAllIssues()).toStrictEqual([issue])
    })

    it('should keep an issue the collector is merged into whole', () => {
      const atCell = cellIssue({
        severity: 'error',
        category: 'technical',
        message: 'Must be a valid date',
        code: 'MUST_BE_A_VALID_DATE',
        location: {
          sheet: 'Exported',
          table: 'RECEIVED_LOADS_FOR_EXPORT',
          row: 9,
          column: 'U',
          header: 'DATE_OF_EXPORT'
        }
      })

      const merged = createValidationIssues()
        .add(issue)
        .merge(createValidationIssues().add(atCell))

      expect(merged.getAllIssues()).toStrictEqual([issue, atCell])
    })
  })
})
