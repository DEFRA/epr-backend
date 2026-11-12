import { toYear } from '#common/helpers/dates/year.js'
import { DEFAULT_TEMPLATE_YEAR } from '#domain/summary-logs/template-year.js'
import { validateMetaSyntax } from './meta-syntax.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'

describe('validateMetaSyntax', () => {
  const createValidMeta = () => ({
    PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
    TEMPLATE_VERSION: { value: 5 },
    MATERIAL: { value: 'Aluminium' },
    ACCREDITATION_NUMBER: { value: 'ACC123' },
    REGISTRATION_NUMBER: { value: 'REG12345' }
  })

  it('returns valid result when all meta fields are syntactically correct', () => {
    const parsed = {
      meta: createValidMeta()
    }

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

    expect(result.isValid()).toBe(true)
    expect(result.isFatal()).toBe(false)
    expect(result.hasIssues()).toBe(false)
  })

  it('returns valid result when optional ACCREDITATION is missing', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
        TEMPLATE_VERSION: { value: 5 },
        MATERIAL: { value: 'Aluminium' },
        REGISTRATION_NUMBER: { value: 'REG12345' }
      }
    }

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

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

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

    expect(result.isValid()).toBe(true)
    expect(result.isFatal()).toBe(false)
  })

  it('returns fatal technical error when PROCESSING_TYPE is missing', () => {
    const parsed = {
      meta: {
        TEMPLATE_VERSION: { value: 5 },
        MATERIAL: { value: 'Aluminium' },
        REGISTRATION_NUMBER: { value: 'REG12345' }
      }
    }

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

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

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

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

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toContain('TEMPLATE_VERSION')
    expect(fatals[0].message).toContain('is required')
  })

  it('returns fatal technical error when TEMPLATE_VERSION is less than 5', () => {
    const parsed = {
      meta: {
        ...createValidMeta(),
        TEMPLATE_VERSION: { value: 4 }
      }
    }

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toContain('TEMPLATE_VERSION')
    expect(fatals[0].message).toContain('at least 5')
  })

  it('accepts major.minor TEMPLATE_VERSION values >= 5', () => {
    const testCases = [5.0, 5.1, 5.5, 6.0]

    for (const version of testCases) {
      const parsed = {
        meta: {
          ...createValidMeta(),
          TEMPLATE_VERSION: { value: version }
        }
      }

      const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

      expect(result.isValid()).toBe(true)
    }
  })

  it('rejects major.minor TEMPLATE_VERSION values < 5', () => {
    const parsed = {
      meta: {
        ...createValidMeta(),
        TEMPLATE_VERSION: { value: 4.9 }
      }
    }

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toContain('at least 5')
  })

  it('returns fatal technical error when REGISTRATION is missing', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
        TEMPLATE_VERSION: { value: 5 },
        MATERIAL: { value: 'Aluminium' }
      }
    }

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

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
        PROCESSING_TYPE: { value: 'EXPORTER' },
        TEMPLATE_VERSION: { value: 0 }
      }
    }

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    // Invalid TEMPLATE_VERSION, missing REGISTRATION_NUMBER
    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(2)

    const issues = result.getIssuesByCategory(VALIDATION_CATEGORY.TECHNICAL)
    expect(issues).toHaveLength(2)
  })

  it('includes actual value in context for debugging', () => {
    const parsed = {
      meta: {
        ...createValidMeta(),
        TEMPLATE_VERSION: { value: 0 }
      }
    }

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals[0]?.context?.actual).toBe(0)
  })

  it('handles missing parsed.meta gracefully', () => {
    const parsed = {}

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(3) // Missing PROCESSING_TYPE, TEMPLATE_VERSION, REGISTRATION_NUMBER
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

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0]?.context?.location).toEqual({
      field: 'TEMPLATE_VERSION'
    })
  })

  it('categorizes all validation errors as fatal technical errors', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'invalid' }
      }
    }

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

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

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0]?.context?.location).toEqual({
      row: 2,
      column: 'E',
      field: 'TEMPLATE_VERSION'
    })
  })

  it('returns fallback error code for unmapped validation errors', () => {
    const parsed = {
      meta: {
        // Boolean triggers string.base for PROCESSING_TYPE, which is not mapped
        PROCESSING_TYPE: { value: true },
        TEMPLATE_VERSION: { value: 5 },
        REGISTRATION_NUMBER: { value: 'REG12345' }
      }
    }

    const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

    expect(result.isValid()).toBe(false)
    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    const fallback = fatals.find((f) => f.code === 'VALIDATION_FALLBACK_ERROR')
    expect(fallback).toBeDefined()
  })

  describe('registered-only processing types', () => {
    it.each([
      { label: 'reprocessor', processingType: 'REPROCESSOR_REGISTERED_ONLY' },
      { label: 'exporter', processingType: 'EXPORTER_REGISTERED_ONLY' }
    ])(
      'accepts TEMPLATE_VERSION >= 2.1 for registered-only $label',
      ({ processingType }) => {
        const parsed = {
          meta: {
            ...createValidMeta(),
            PROCESSING_TYPE: { value: processingType },
            TEMPLATE_VERSION: { value: 2.1 }
          }
        }

        const result = validateMetaSyntax({
          parsed,
          year: DEFAULT_TEMPLATE_YEAR
        })

        expect(result.isValid()).toBe(true)
      }
    )

    it.each([
      { label: 'reprocessor', processingType: 'REPROCESSOR_REGISTERED_ONLY' },
      { label: 'exporter', processingType: 'EXPORTER_REGISTERED_ONLY' }
    ])(
      'rejects TEMPLATE_VERSION < 2.1 for registered-only $label',
      ({ processingType }) => {
        const parsed = {
          meta: {
            ...createValidMeta(),
            PROCESSING_TYPE: { value: processingType },
            TEMPLATE_VERSION: { value: 2 }
          }
        }

        const result = validateMetaSyntax({
          parsed,
          year: DEFAULT_TEMPLATE_YEAR
        })

        expect(result.isValid()).toBe(false)
        expect(result.isFatal()).toBe(true)

        const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
        expect(fatals).toHaveLength(1)
        expect(fatals[0].message).toContain('TEMPLATE_VERSION')
        expect(fatals[0].message).toContain('at least 2.1')
      }
    )
  })

  describe('type coercion for ExcelJS values', () => {
    it('coerces numeric REGISTRATION_NUMBER to string', () => {
      // ExcelJS may return a number if the cell looks numeric
      const parsed = {
        meta: {
          PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
          TEMPLATE_VERSION: { value: 5 },
          MATERIAL: { value: 'Aluminium' },
          REGISTRATION_NUMBER: { value: 12345 } // number instead of string
        }
      }

      const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('coerces numeric ACCREDITATION_NUMBER to string', () => {
      // ExcelJS may return a number if the cell looks numeric
      const parsed = {
        meta: {
          PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
          TEMPLATE_VERSION: { value: 5 },
          MATERIAL: { value: 'Aluminium' },
          REGISTRATION_NUMBER: { value: 'REG12345' },
          ACCREDITATION_NUMBER: { value: 98765 } // number instead of string
        }
      }

      const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('coerces string TEMPLATE_VERSION to number', () => {
      // ExcelJS may return a string if the cell is formatted as text
      const parsed = {
        meta: {
          PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
          TEMPLATE_VERSION: { value: '5' }, // string instead of number
          MATERIAL: { value: 'Aluminium' },
          REGISTRATION_NUMBER: { value: 'REG12345' }
        }
      }

      const result = validateMetaSyntax({ parsed, year: DEFAULT_TEMPLATE_YEAR })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })

  describe('template year', () => {
    const validateVersion = (
      version,
      {
        processingType = 'REPROCESSOR_INPUT',
        year = DEFAULT_TEMPLATE_YEAR
      } = {}
    ) =>
      validateMetaSyntax({
        parsed: {
          meta: {
            ...createValidMeta(),
            PROCESSING_TYPE: { value: processingType },
            TEMPLATE_VERSION: {
              value: version,
              location: { sheet: 'Cover', row: 3, column: 'C' }
            }
          }
        },
        year
      })

    const fatalsFor = (version, options) =>
      validateVersion(version, options).getIssuesBySeverity(
        VALIDATION_SEVERITY.FATAL
      )

    it.each([
      [5, 'REPROCESSOR_INPUT'],
      [2.1, 'REPROCESSOR_REGISTERED_ONLY']
    ])(
      'accepts the 2026 template version %s for %s in a 2026 summary log',
      (version, processingType) => {
        expect(validateVersion(version, { processingType }).isValid()).toBe(
          true
        )
      }
    )

    it.each(['REPROCESSOR_INPUT', 'EXPORTER_REGISTERED_ONLY'])(
      'accepts the 2027 template version 2027.01 for %s in a 2027 summary log',
      (processingType) => {
        expect(
          validateVersion(2027.01, {
            processingType,
            year: toYear(2027)
          }).isValid()
        ).toBe(true)
      }
    )

    it.each([2027.02, 2027.1])(
      'rejects %s, beyond the 2027 template versions, as TEMPLATE_VERSION_INVALID',
      (version) => {
        const fatals = fatalsFor(version, { year: toYear(2027) })

        expect(fatals).toHaveLength(1)
        expect(fatals[0]).toMatchObject({
          code: 'TEMPLATE_VERSION_INVALID',
          message:
            "Invalid meta field 'TEMPLATE_VERSION': must be at most 2027.01"
        })
      }
    )

    it('rejects the 2027 template version 2027.01 in a 2026 summary log as TEMPLATE_YEAR_MISMATCH', () => {
      const fatals = fatalsFor(2027.01)

      expect(fatals).toHaveLength(1)
      expect(fatals[0]).toMatchObject({
        code: 'TEMPLATE_YEAR_MISMATCH',
        message:
          "Invalid meta field 'TEMPLATE_VERSION': must be a template for 2026"
      })
    })

    it.each([2026, 2028])(
      'rejects 2028.01, a year with no template yet, in a %s summary log as TEMPLATE_YEAR_INVALID',
      (year) => {
        const fatals = fatalsFor(2028.01, { year: toYear(year) })

        expect(fatals).toHaveLength(1)
        expect(fatals[0]).toMatchObject({
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'TEMPLATE_YEAR_INVALID',
          message:
            "Invalid meta field 'TEMPLATE_VERSION': must be a template for a supported year",
          context: {
            actual: 2028.01,
            location: {
              sheet: 'Cover',
              row: 3,
              column: 'C',
              field: 'TEMPLATE_VERSION'
            }
          }
        })
      }
    )

    it.each([
      [5, 'REPROCESSOR_INPUT'],
      [2.1, 'REPROCESSOR_REGISTERED_ONLY']
    ])(
      'rejects the 2026 template version %s for %s in a 2027 summary log as TEMPLATE_YEAR_MISMATCH',
      (version, processingType) => {
        const fatals = fatalsFor(version, {
          processingType,
          year: toYear(2027)
        })

        expect(fatals).toHaveLength(1)
        expect(fatals[0]).toMatchObject({
          category: VALIDATION_CATEGORY.TECHNICAL,
          code: 'TEMPLATE_YEAR_MISMATCH',
          message:
            "Invalid meta field 'TEMPLATE_VERSION': must be a template for 2027",
          context: {
            actual: version,
            location: {
              sheet: 'Cover',
              row: 3,
              column: 'C',
              field: 'TEMPLATE_VERSION'
            }
          }
        })
      }
    )

    it('rejects a version below the minimum for its processing type as TEMPLATE_VERSION_INVALID', () => {
      const fatals = fatalsFor(4)

      expect(fatals).toHaveLength(1)
      expect(fatals[0]).toMatchObject({
        code: 'TEMPLATE_VERSION_INVALID',
        message: "Invalid meta field 'TEMPLATE_VERSION': must be at least 5"
      })
    })

    it.each([5, 4, 2027.01])(
      'rejects only the processing type when it is unknown, whatever the version (%s)',
      (version) => {
        const fatals = fatalsFor(version, { processingType: 'UNKNOWN' })

        expect(fatals).toHaveLength(1)
        expect(fatals[0].code).toBe('PROCESSING_TYPE_INVALID')
      }
    )
  })
})
