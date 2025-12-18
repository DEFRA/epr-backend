import { validateMetaSyntax } from './meta-syntax.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'

describe('validateMetaSyntax', () => {
  const createValidMeta = () => ({
    PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
    TEMPLATE_VERSION: { value: 1 },
    MATERIAL: { value: 'Aluminium' },
    ACCREDITATION_NUMBER: { value: 'ACC123' },
    REGISTRATION_NUMBER: { value: 'REG12345' }
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
        PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
        TEMPLATE_VERSION: { value: 1 },
        MATERIAL: { value: 'Aluminium' },
        REGISTRATION_NUMBER: { value: 'REG12345' }
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
        ACCREDITATION_NUMBER: { value: null }
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
        REGISTRATION_NUMBER: { value: 'REG12345' }
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

  it('returns fatal technical error when PROCESSING_TYPE is not a valid value', () => {
    const parsed = {
      meta: {
        ...createValidMeta(),
        PROCESSING_TYPE: { value: 'INVALID_TYPE' }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toContain('PROCESSING_TYPE')
    expect(fatals[0].message).toContain('must be one of')
  })

  it('returns fatal technical error when TEMPLATE_VERSION is missing', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
        MATERIAL: { value: 'Aluminium' },
        REGISTRATION_NUMBER: { value: 'REG12345' }
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
        PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
        TEMPLATE_VERSION: { value: 1 },
        REGISTRATION_NUMBER: { value: 'REG12345' }
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
        PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
        TEMPLATE_VERSION: { value: 1 },
        MATERIAL: { value: 'Aluminium' }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toContain('REGISTRATION_NUMBER')
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
        PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' }, // No location property
        TEMPLATE_VERSION: { value: 0 }, // Invalid value, no location
        MATERIAL: { value: 'Aluminium' },
        REGISTRATION_NUMBER: { value: 'REG12345' }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].context.location).toEqual({
      field: 'TEMPLATE_VERSION'
    })
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
        PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
        TEMPLATE_VERSION: {
          value: -1,
          location: { row: 2, column: 'E' }
        },
        MATERIAL: { value: 'Aluminium' },
        REGISTRATION_NUMBER: { value: 'REG12345' }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].context.location).toEqual({
      row: 2,
      column: 'E',
      field: 'TEMPLATE_VERSION'
    })
  })

  it('returns fallback error code for unmapped validation errors', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
        TEMPLATE_VERSION: { value: 1 },
        // MATERIAL exceeds max length - triggers string.max which is not mapped
        MATERIAL: { value: 'A'.repeat(51) },
        REGISTRATION_NUMBER: { value: 'REG12345' }
      }
    }

    const result = validateMetaSyntax({ parsed })

    expect(result.isValid()).toBe(false)
    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].code).toBe('VALIDATION_FALLBACK_ERROR')
  })

  describe('type coercion for ExcelJS values', () => {
    it('coerces numeric REGISTRATION_NUMBER to string', () => {
      // ExcelJS may return a number if the cell looks numeric
      const parsed = {
        meta: {
          PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
          TEMPLATE_VERSION: { value: 1 },
          MATERIAL: { value: 'Aluminium' },
          REGISTRATION_NUMBER: { value: 12345 } // number instead of string
        }
      }

      const result = validateMetaSyntax({ parsed })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('coerces numeric MATERIAL to string', () => {
      // ExcelJS may return a number if the cell looks numeric
      const parsed = {
        meta: {
          PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
          TEMPLATE_VERSION: { value: 1 },
          MATERIAL: { value: 12345 }, // number instead of string
          REGISTRATION_NUMBER: { value: 'REG12345' }
        }
      }

      const result = validateMetaSyntax({ parsed })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('coerces numeric ACCREDITATION_NUMBER to string', () => {
      // ExcelJS may return a number if the cell looks numeric
      const parsed = {
        meta: {
          PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
          TEMPLATE_VERSION: { value: 1 },
          MATERIAL: { value: 'Aluminium' },
          REGISTRATION_NUMBER: { value: 'REG12345' },
          ACCREDITATION_NUMBER: { value: 98765 } // number instead of string
        }
      }

      const result = validateMetaSyntax({ parsed })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('coerces string TEMPLATE_VERSION to number', () => {
      // ExcelJS may return a string if the cell is formatted as text
      const parsed = {
        meta: {
          PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
          TEMPLATE_VERSION: { value: '1' }, // string instead of number
          MATERIAL: { value: 'Aluminium' },
          REGISTRATION_NUMBER: { value: 'REG12345' }
        }
      }

      const result = validateMetaSyntax({ parsed })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })
})
