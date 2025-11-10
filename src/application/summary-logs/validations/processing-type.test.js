import { validateProcessingType } from './processing-type.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_SEVERITY
} from '#common/validation/validation-issues.js'

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

  it('returns fatal business error when registration has unexpected waste processing type', () => {
    const parsed = {
      meta: {
        REGISTRATION: { value: 'WRN12345' },
        PROCESSING_TYPE: { value: 'REPROCESSOR' }
      }
    }
    const registration = {
      wasteProcessingType: 'invalid-unexpected-type'
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
      'Invalid summary log: registration has unexpected waste processing type'
    )
    expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
    expect(fatals[0].context.actual).toBe('invalid-unexpected-type')
  })

  it('returns fatal business error when types do not match', () => {
    const parsed = {
      meta: {
        REGISTRATION: { value: 'WRN12345' },
        PROCESSING_TYPE: { value: 'REPROCESSOR' }
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
      'Summary log processing type does not match registration processing type'
    )
    expect(fatals[0].category).toBe(VALIDATION_CATEGORY.BUSINESS)
    expect(fatals[0].context.path).toBe('meta.PROCESSING_TYPE')
    expect(fatals[0].context.expected).toBe('reprocessor')
    expect(fatals[0].context.actual).toBe('exporter')
  })

  it('returns valid result when types match - REPROCESSOR', () => {
    const parsed = {
      meta: {
        REGISTRATION: { value: 'WRN12345' },
        PROCESSING_TYPE: { value: 'REPROCESSOR' }
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

    expect(result.isValid()).toBe(true)
    expect(result.isFatal()).toBe(false)
    expect(result.hasIssues()).toBe(false)
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Summary log type validated: test, spreadsheetType=REPROCESSOR, wasteProcessingType=reprocessor'
      })
    )
  })

  it('returns valid result when types match - EXPORTER', () => {
    const parsed = {
      meta: {
        REGISTRATION: { value: 'WRN12345' },
        PROCESSING_TYPE: { value: 'EXPORTER' }
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

    expect(result.isValid()).toBe(true)
    expect(result.isFatal()).toBe(false)
    expect(result.hasIssues()).toBe(false)
    expect(mockLoggerInfo).toHaveBeenCalled()
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
})
