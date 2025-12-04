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
    ['REPROCESSOR_INPUT', 'reprocessor'],
    ['REPROCESSOR_OUTPUT', 'reprocessor'],
    ['EXPORTER', 'exporter']
  ])(
    'returns valid result when types match - %s',
    (spreadsheetType, registrationType) => {
      const parsed = {
        meta: {
          REGISTRATION_NUMBER: { value: 'REG12345' },
          PROCESSING_TYPE: { value: spreadsheetType }
        }
      }
      const registration = {
        wasteProcessingType: registrationType
      }

      const result = validateProcessingType({
        parsed,
        registration,
        loggingContext: 'test'
      })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
      expect(result.hasIssues()).toBe(false)
      expect(mockLoggerInfo).toHaveBeenCalled()
    }
  )

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
