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

/**
 * A collector holding one issue of each severity given, in order.
 *
 * @param {...ValidationSeverity} severities
 */
const collectorOf = (...severities) =>
  severities.reduce(
    (issues, severity, index) =>
      issues.add(anIssue(severity, `${severity} ${index + 1}`)),
    createValidationIssues()
  )

const { FATAL, ERROR, WARNING } = VALIDATION_SEVERITY

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

  /**
   * @type {{
   *   method: 'hasIssues' | 'isFatal' | 'isValid',
   *   cases: { description: string, expected: boolean, severities: ValidationSeverity[] }[]
   * }[]}
   */
  const PREDICATES = [
    {
      method: 'isFatal',
      cases: [
        { description: 'one fatal', severities: [FATAL], expected: true },
        {
          description: 'two fatals',
          severities: [FATAL, FATAL],
          expected: true
        },
        {
          description: 'fatal among others',
          severities: [WARNING, FATAL, ERROR],
          expected: true
        },
        {
          description: 'no fatal',
          severities: [ERROR, WARNING],
          expected: false
        },
        { description: 'no issues', severities: [], expected: false }
      ]
    },
    {
      method: 'isValid',
      cases: [
        { description: 'no issues', severities: [], expected: true },
        {
          description: 'only warnings',
          severities: [WARNING, WARNING],
          expected: true
        },
        { description: 'a fatal', severities: [FATAL], expected: false },
        { description: 'an error', severities: [ERROR], expected: false },
        {
          description: 'errors and warnings',
          severities: [ERROR, WARNING],
          expected: false
        },
        {
          description: 'every severity',
          severities: [FATAL, ERROR, WARNING],
          expected: false
        }
      ]
    },
    {
      method: 'hasIssues',
      cases: [
        { description: 'no issues', severities: [], expected: false },
        { description: 'a fatal', severities: [FATAL], expected: true },
        { description: 'an error', severities: [ERROR], expected: true },
        { description: 'a warning', severities: [WARNING], expected: true }
      ]
    }
  ]

  describe.for(PREDICATES)('$method', ({ method, cases }) => {
    it.for(cases)(
      'should be $expected with $description',
      ({ severities, expected }) => {
        expect(collectorOf(...severities)[method]()).toBe(expected)
      }
    )
  })

  describe('getIssuesBySeverity', () => {
    const issues = collectorOf(FATAL, ERROR, FATAL, WARNING, ERROR, WARNING)

    it.for([
      { severity: FATAL, messages: ['fatal 1', 'fatal 3'] },
      { severity: ERROR, messages: ['error 2', 'error 5'] },
      { severity: WARNING, messages: ['warning 4', 'warning 6'] }
    ])('should return only the $severity issues', ({ severity, messages }) => {
      expect(
        issues.getIssuesBySeverity(severity).map(({ message }) => message)
      ).toStrictEqual(messages)
    })

    it('should return none when no issue has that severity', () => {
      expect(collectorOf(ERROR).getIssuesBySeverity(FATAL)).toStrictEqual([])
    })
  })

  describe('getIssuesByCategory', () => {
    const issues = createValidationIssues()
      .add(anIssue(FATAL, 'Technical 1'))
      .add(
        anIssue(WARNING, 'Business 1', {
          category: VALIDATION_CATEGORY.BUSINESS
        })
      )
      .add(anIssue(ERROR, 'Technical 2'))
      .add(
        anIssue(WARNING, 'Business 2', {
          category: VALIDATION_CATEGORY.BUSINESS
        })
      )

    it.for([
      {
        category: VALIDATION_CATEGORY.TECHNICAL,
        messages: ['Technical 1', 'Technical 2']
      },
      {
        category: VALIDATION_CATEGORY.BUSINESS,
        messages: ['Business 1', 'Business 2']
      }
    ])('should return only the $category issues', ({ category, messages }) => {
      expect(
        issues.getIssuesByCategory(category).map(({ message }) => message)
      ).toStrictEqual(messages)
    })

    it('should return none when no issue has that category', () => {
      expect(
        collectorOf(ERROR).getIssuesByCategory(VALIDATION_CATEGORY.BUSINESS)
      ).toStrictEqual([])
    })
  })

  describe('groupBySeverity', () => {
    it('groups all issues by severity', () => {
      const result = createValidationIssues()
      result.add(anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal 1'))
      result.add(anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal 2'))
      result.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1'))
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 1', {
          category: VALIDATION_CATEGORY.BUSINESS
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 2', {
          category: VALIDATION_CATEGORY.BUSINESS
        })
      )

      const grouped = result.groupBySeverity()

      expect(grouped[VALIDATION_SEVERITY.FATAL]).toHaveLength(2)
      expect(grouped[VALIDATION_SEVERITY.ERROR]).toHaveLength(1)
      expect(grouped[VALIDATION_SEVERITY.WARNING]).toHaveLength(2)
    })

    it('returns empty arrays for severities with no issues', () => {
      const result = createValidationIssues()
      result.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1'))

      const grouped = result.groupBySeverity()

      expect(grouped[VALIDATION_SEVERITY.FATAL]).toHaveLength(0)
      expect(grouped[VALIDATION_SEVERITY.ERROR]).toHaveLength(1)
      expect(grouped[VALIDATION_SEVERITY.WARNING]).toHaveLength(0)
    })
  })

  describe('getAllIssues', () => {
    it('returns all issues', () => {
      const result = createValidationIssues()
      result.add(anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal'))
      result.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error'))
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning', {
          category: VALIDATION_CATEGORY.BUSINESS
        })
      )

      const all = result.getAllIssues()

      expect(all).toHaveLength(3)
    })

    it('returns a copy of the issues array', () => {
      const result = createValidationIssues()
      result.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error'))

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
      result.add(anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal 1'))
      result.add(anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal 2'))
      result.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1'))
      result.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error 2'))
      result.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error 3'))
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning 1', {
          category: VALIDATION_CATEGORY.BUSINESS
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
    it.for([
      { severities: [], summary: 'Validation passed with no issues' },
      {
        severities: [FATAL, FATAL],
        summary: 'Validation completed with 2 fatal'
      },
      { severities: [ERROR], summary: 'Validation completed with 1 error' },
      {
        severities: [ERROR, ERROR],
        summary: 'Validation completed with 2 errors'
      },
      { severities: [WARNING], summary: 'Validation completed with 1 warning' },
      {
        severities: [WARNING, WARNING],
        summary: 'Validation completed with 2 warnings'
      },
      {
        severities: [FATAL, ERROR, ERROR, WARNING],
        summary: 'Validation completed with 1 fatal, 2 errors, 1 warning'
      },
      {
        severities: [FATAL, ERROR],
        summary: 'Validation completed with 1 fatal, 1 error'
      },
      {
        severities: [ERROR, WARNING],
        summary: 'Validation completed with 1 error, 1 warning'
      }
    ])("should read '$summary'", ({ severities, summary }) => {
      expect(collectorOf(...severities).getSummary()).toBe(summary)
    })
  })

  describe('context properties', () => {
    it('stores all context properties', () => {
      const result = createValidationIssues()
      result.add(
        fileIssue({
          category: VALIDATION_CATEGORY.TECHNICAL,
          message: 'Complex error',
          code: 'SPREADSHEET_INVALID_ERROR',
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
          location: { ...TEST_CELL, row: 5, header: 'ROW_ID' }
        })
      )
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Below threshold', {
          category: VALIDATION_CATEGORY.BUSINESS,
          location: { ...TEST_CELL, row: 10, header: 'TONNAGE' },
          actual: 0.001
        })
      )
      result.add(
        fileIssue({
          category: VALIDATION_CATEGORY.TECHNICAL,
          message: 'Could not parse file',
          code: 'SPREADSHEET_INVALID_ERROR'
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
          code: 'PROCESSING_TYPE_MISMATCH',
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
      result.add(anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal technical'))
      result.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Technical error'))
      result.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Business warning', {
          category: VALIDATION_CATEGORY.BUSINESS
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
          code: 'VALIDATION_SYSTEM_ERROR'
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
            code: 'SPREADSHEET_INVALID_ERROR'
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
          code: 'SPREADSHEET_INVALID_ERROR',
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
      result1.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1'))

      const result2 = createValidationIssues()
      result2.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error 2'))

      result1.merge(result2)

      expect(result1.getAllIssues()).toHaveLength(2)
      expect(result1.getAllIssues()[0].message).toBe('Error 1')
      expect(result1.getAllIssues()[1].message).toBe('Error 2')
    })

    it('returns this for chaining', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()
      const result3 = createValidationIssues()

      result1.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1'))
      result2.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error 2'))
      result3.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error 3'))

      const returned = result1.merge(result2).merge(result3)

      expect(returned).toBe(result1)
      expect(result1.getAllIssues()).toHaveLength(3)
    })

    it('merges empty result without errors', () => {
      const result1 = createValidationIssues()
      result1.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1'))

      const result2 = createValidationIssues()

      result1.merge(result2)

      expect(result1.getAllIssues()).toHaveLength(1)
    })

    it('merges into empty result', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()

      result2.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1'))

      result1.merge(result2)

      expect(result1.getAllIssues()).toHaveLength(1)
      expect(result1.getAllIssues()[0].message).toBe('Error 1')
    })

    it('preserves severity levels when merging', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()

      result2.add(anIssue(VALIDATION_SEVERITY.FATAL, 'Fatal'))
      result2.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error'))
      result2.add(
        anIssue(VALIDATION_SEVERITY.WARNING, 'Warning', {
          category: VALIDATION_CATEGORY.BUSINESS
        })
      )

      result1.merge(result2)

      expect(result1.isFatal()).toBe(true)
      expect(result1.isValid()).toBe(false)
      expect(result1.hasIssues()).toBe(true)
      expect(result1.getAllIssues()).toHaveLength(3)
    })

    /** @type {unknown[]} */
    const NOT_COLLECTORS = [{}, null, [], 'string']

    it.for(NOT_COLLECTORS)(
      'throws TypeError when merging %j',
      (notCollector) => {
        const result = createValidationIssues()

        // @ts-expect-error -- not a collector; testing the runtime guard
        expect(() => result.merge(notCollector)).toThrow(TypeError)
      }
    )

    it('does not modify the source result being merged', () => {
      const result1 = createValidationIssues()
      const result2 = createValidationIssues()

      result2.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error 1'))

      result1.merge(result2)

      expect(result2.getAllIssues()).toHaveLength(1)
      expect(result1.getAllIssues()).toHaveLength(1)

      result1.add(anIssue(VALIDATION_SEVERITY.ERROR, 'Error 2'))

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
