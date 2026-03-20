import { validateProcessingType } from './processing-type.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_SEVERITY
} from '#common/enums/validation.js'

const mockLoggerInfo = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args)
  }
}))

const registeredOnlyEnabled = { isRegisteredOnlyEnabled: () => true }
const registeredOnlyDisabled = { isRegisteredOnlyEnabled: () => false }

describe('validateProcessingType', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns fatal business error when registration has invalid waste processing type', () => {
    const parsed = {
      meta: {
        REGISTRATION_NUMBER: { value: 'REG12345' },
        PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' }
      }
    }
    const registration = {
      wasteProcessingType: 'invalid-type'
    }

    const result = validateProcessingType({
      parsed,
      registration,
      loggingContext: 'test'
    })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toBe(
      'Invalid summary log: registration has invalid waste processing type'
    )
    expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
    expect(fatals[0].context.actual).toBe('invalid-type')
  })

  it('returns fatal business error when types do not match', () => {
    const parsed = {
      meta: {
        REGISTRATION_NUMBER: { value: 'REG12345' },
        PROCESSING_TYPE: {
          value: 'REPROCESSOR_INPUT',
          location: { sheet: 'Cover', row: 5, column: 'B' }
        }
      }
    }
    const registration = {
      wasteProcessingType: 'exporter'
    }

    const result = validateProcessingType({
      parsed,
      registration,
      loggingContext: 'test'
    })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals).toHaveLength(1)
    expect(fatals[0].message).toBe(
      'Summary log processing type does not match registration waste processing type'
    )
    expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
    expect(fatals[0].context.location).toEqual({
      sheet: 'Cover',
      row: 5,
      column: 'B',
      field: 'PROCESSING_TYPE'
    })
    expect(fatals[0].context.expected).toBe('exporter')
    expect(fatals[0].context.actual).toBe('REPROCESSOR_INPUT')
  })

  it.each([
    [
      'REPROCESSOR_INPUT',
      'reprocessor',
      'input',
      { accreditationNumber: 'ACC1' }
    ],
    [
      'REPROCESSOR_OUTPUT',
      'reprocessor',
      'output',
      { accreditationNumber: 'ACC2' }
    ],
    ['EXPORTER', 'exporter', undefined, { accreditationNumber: 'ACC3' }],
    ['REPROCESSOR_REGISTERED_ONLY', 'reprocessor', undefined, undefined],
    ['EXPORTER_REGISTERED_ONLY', 'exporter', undefined, undefined]
  ])(
    'returns valid result when types match - %s',
    (spreadsheetType, wasteProcessingType, reprocessingType, accreditation) => {
      const parsed = {
        meta: {
          REGISTRATION_NUMBER: { value: 'REG12345' },
          PROCESSING_TYPE: { value: spreadsheetType }
        }
      }
      const registration = {
        wasteProcessingType,
        reprocessingType,
        accreditation
      }

      const result = validateProcessingType({
        parsed,
        registration,
        loggingContext: 'test',
        featureFlags: registeredOnlyEnabled
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
      expect(result.hasIssues()).toBe(false)
      expect(mockLoggerInfo).toHaveBeenCalled()
    }
  )

  it.each([
    ['REPROCESSOR_INPUT', 'output'],
    ['REPROCESSOR_OUTPUT', 'input']
  ])(
    'returns fatal error when reprocessingType does not match - %s with %s',
    (spreadsheetType, reprocessingType) => {
      const parsed = {
        meta: {
          REGISTRATION_NUMBER: { value: 'REG12345' },
          PROCESSING_TYPE: {
            value: spreadsheetType,
            location: { sheet: 'Cover', row: 5, column: 'B' }
          }
        }
      }
      const registration = {
        wasteProcessingType: 'reprocessor',
        reprocessingType,
        accreditation: { accreditationNumber: 'ACC123' }
      }

      const result = validateProcessingType({
        parsed,
        registration,
        loggingContext: 'test',
        featureFlags: registeredOnlyEnabled
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0].message).toBe(
        'Summary log processing type does not match registration reprocessing type'
      )
      expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
      expect(fatals[0].context.expected).toBe(reprocessingType)
      expect(fatals[0].context.actual).toBe(spreadsheetType)
    }
  )

  it.each([
    ['REPROCESSOR_REGISTERED_ONLY', 'reprocessor'],
    ['EXPORTER_REGISTERED_ONLY', 'exporter']
  ])(
    'returns fatal error when %s template is uploaded against accredited registration',
    (spreadsheetType, wasteProcessingType) => {
      const parsed = {
        meta: {
          PROCESSING_TYPE: {
            value: spreadsheetType,
            location: { sheet: 'Cover', row: 5, column: 'B' }
          }
        }
      }
      const registration = {
        wasteProcessingType,
        accreditation: { accreditationNumber: 'ACC123' }
      }

      const result = validateProcessingType({
        parsed,
        registration,
        loggingContext: 'test',
        featureFlags: registeredOnlyEnabled
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0].message).toContain('accreditation status')
      expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
    }
  )

  it.each([
    ['REPROCESSOR_INPUT', 'reprocessor', 'input'],
    ['REPROCESSOR_OUTPUT', 'reprocessor', 'output'],
    ['EXPORTER', 'exporter', undefined]
  ])(
    'returns fatal error when %s template is uploaded against registered-only registration',
    (spreadsheetType, wasteProcessingType, reprocessingType) => {
      const parsed = {
        meta: {
          PROCESSING_TYPE: {
            value: spreadsheetType,
            location: { sheet: 'Cover', row: 5, column: 'B' }
          }
        }
      }
      const registration = {
        wasteProcessingType,
        reprocessingType
        // No accreditation — registered-only
      }

      const result = validateProcessingType({
        parsed,
        registration,
        loggingContext: 'test',
        featureFlags: registeredOnlyEnabled
      })

      expect(result.isValid()).toBe(false)
      expect(result.isFatal()).toBe(true)

      const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
      expect(fatals).toHaveLength(1)
      expect(fatals[0].message).toContain('accreditation status')
      expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
    }
  )

  it('skips accredited-vs-registered-only check when feature flag is disabled', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'EXPORTER' }
      }
    }
    const registration = {
      wasteProcessingType: 'exporter'
      // No accreditation — registered-only
    }

    const result = validateProcessingType({
      parsed,
      registration,
      loggingContext: 'test',
      featureFlags: registeredOnlyDisabled
    })

    expect(result.isValid()).toBe(true)
  })

  it('skips accredited-vs-registered-only check when featureFlags is not provided', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'EXPORTER' }
      }
    }
    const registration = {
      wasteProcessingType: 'exporter'
      // No accreditation — registered-only
    }

    const result = validateProcessingType({
      parsed,
      registration,
      loggingContext: 'test'
    })

    expect(result.isValid()).toBe(true)
  })

  it('categorizes type mismatch as fatal business error', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'EXPORTER' }
      }
    }
    const registration = {
      wasteProcessingType: 'reprocessor'
    }

    const result = validateProcessingType({
      parsed,
      registration,
      loggingContext: 'test'
    })

    expect(result.isFatal()).toBe(true)
    const issues = result.getIssuesByCategory(VALIDATION_CATEGORY.BUSINESS)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe(VALIDATION_SEVERITY.FATAL)
  })

  it('handles missing location gracefully by including only field', () => {
    const parsed = {
      meta: {
        PROCESSING_TYPE: { value: 'EXPORTER' } // No location provided
      }
    }
    const registration = {
      wasteProcessingType: 'reprocessor'
    }

    const result = validateProcessingType({
      parsed,
      registration,
      loggingContext: 'test'
    })

    expect(result.isFatal()).toBe(true)
    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals[0].context.location).toEqual({
      field: 'PROCESSING_TYPE' // Only field is set when location is missing
    })
  })
})
