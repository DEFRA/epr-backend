import { validateMetaSyntax } from './meta-syntax.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_SEVERITY
} from '#common/validation/validation-issues.js'

describe('validateMetaSyntax', () => {
  const createValidMeta = () => ({
    PROCESSING_TYPE: { value: 'REPROCESSOR' },
    TEMPLATE_VERSION: { value: 1 },
    MATERIAL: { value: 'Aluminium' },
    ACCREDITATION: { value: 'ACC123' },
    REGISTRATION: { value: 'WRN12345' }
  })

  it('returns valid result when all meta fields are syntactically correct', () => {
    const parsed = {
      meta: createValidMeta()
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(true)
    expect(result.isFatal()).toBe(false)
    expect(result.hasIssues()).toBe(false)
  })

  it('returns valid result when optional ACCREDITATION is missing', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'REPROCESSOR' },
        TEMPLATE_VERSION: { value: 1 },
        MATERIAL: { value: 'Aluminium' },
        REGISTRATION: { value: 'WRN12345' }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(true)
    expect(result.isFatal()).toBe(false)
  })

  it('returns valid result when ACCREDITATION is null', () => {
    const parsed = {
      meta: {
        ...createValidMeta(),
        ACCREDITATION: { value: null }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(true)
    expect(result.isFatal()).toBe(false)
  })

  it('returns fatal technical error when PROCESSING_TYPE is missing', () => {
    const parsed = {
      meta: {
        TEMPLATE_VERSION: { value: 1 },
        MATERIAL: { value: 'Aluminium' },
        REGISTRATION: { value: 'WRN12345' }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].category).toBe(VALIDATION_CATEGORY.TECHNICAL)
    expect(fatals[0].message).toContain('PROCESSING_TYPE')
    expect(fatals[0].message).toContain('is required')
  })

  it('returns fatal technical error when PROCESSING_TYPE exceeds max length', () => {
    const parsed = {
      meta: {
        ...createValidMeta(),
        PROCESSING_TYPE: { value: 'A'.repeat(31) }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toContain('PROCESSING_TYPE')
    expect(fatals[0].message).toContain('at most 30 characters')
  })

  it('returns fatal technical error when PROCESSING_TYPE is not in SCREAMING_SNAKE_CASE format', () => {
    const parsed = {
      meta: {
        ...createValidMeta(),
        PROCESSING_TYPE: { value: 'Reprocessor' }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toContain('PROCESSING_TYPE')
    expect(fatals[0].message).toContain('SCREAMING_SNAKE_CASE')
  })

  it('returns fatal technical error when TEMPLATE_VERSION is missing', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'REPROCESSOR' },
        MATERIAL: { value: 'Aluminium' },
        REGISTRATION: { value: 'WRN12345' }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toContain('TEMPLATE_VERSION')
    expect(fatals[0].message).toContain('is required')
  })

  it('returns fatal technical error when TEMPLATE_VERSION is less than 1', () => {
    const parsed = {
      meta: {
        ...createValidMeta(),
        TEMPLATE_VERSION: { value: 0 }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toContain('TEMPLATE_VERSION')
    expect(fatals[0].message).toContain('at least 1')
  })

  it('returns fatal technical error when MATERIAL is missing', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'REPROCESSOR' },
        TEMPLATE_VERSION: { value: 1 },
        REGISTRATION: { value: 'WRN12345' }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toContain('MATERIAL')
    expect(fatals[0].message).toContain('is required')
  })

  it('returns fatal technical error when MATERIAL exceeds max length', () => {
    const parsed = {
      meta: {
        ...createValidMeta(),
        MATERIAL: { value: 'A'.repeat(51) }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toContain('MATERIAL')
    expect(fatals[0].message).toContain('at most 50 characters')
  })

  it('returns fatal technical error when REGISTRATION is missing', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'REPROCESSOR' },
        TEMPLATE_VERSION: { value: 1 },
        MATERIAL: { value: 'Aluminium' }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toContain('REGISTRATION')
    expect(fatals[0].message).toContain('is required')
  })

  it('returns multiple fatal technical errors when multiple fields are invalid', () => {
    const parsed = {
      meta: {
        TEMPLATE_VERSION: { value: 0 },
        MATERIAL: { value: 'A'.repeat(51) }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals.length).toBeGreaterThanOrEqual(3) // Missing required fields + validation errors

    const issues = result.getIssuesByCategory(VALIDATION_CATEGORY.TECHNICAL)
    expect(issues.length).toBeGreaterThanOrEqual(3)
  })

  it('includes actual value in context for debugging', () => {
    const parsed = {
      meta: {
        ...createValidMeta(),
        TEMPLATE_VERSION: { value: 0 }
      }
    }

    const result = validateMetaSyntax({ parsed })

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals[0].context.actual).toBe(0)
  })

  it('handles missing parsed.meta gracefully', () => {
    const parsed = {}

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals.length).toBeGreaterThanOrEqual(3) // Missing all required fields
  })

  it('handles fields without location data', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'REPROCESSOR' }, // No location property
        TEMPLATE_VERSION: { value: 0 }, // Invalid value, no location
        MATERIAL: { value: 'Aluminium' },
        REGISTRATION: { value: 'WRN12345' }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].context.location).toBeUndefined()
  })

  it('categorizes all validation errors as fatal technical errors', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'invalid' }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isFatal()).toBe(true)
    const issues = result.getAllIssues()
    issues.forEach((issue) => {
      expect(issue.severity).toBe(VALIDATION_SEVERITY.FATAL)
      expect(issue.category).toBe(VALIDATION_CATEGORY.TECHNICAL)
    })
  })

  it('includes location data when available in the parsed structure', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'REPROCESSOR' },
        TEMPLATE_VERSION: {
          value: -1,
          location: { row: 2, col: 5 }
        },
        MATERIAL: { value: 'Aluminium' },
        REGISTRATION: { value: 'WRN12345' }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].context.location).toEqual({ row: 2, col: 5 })
  })
})
