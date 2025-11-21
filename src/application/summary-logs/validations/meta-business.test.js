import { validateMetaBusiness } from './meta-business.js'
import { VALIDATION_SEVERITY } from '#common/enums/validation.js'

describe('validateMetaBusiness', () => {
  const createValidMeta = () => ({
    REGISTRATION: { value: 'WRN12345' },
    PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' },
    MATERIAL: { value: 'Aluminium' },
    ACCREDITATION: { value: 'ACC123' }
  })

  const createValidRegistration = () => ({
    id: 'reg-123',
    registrationNumber: 'WRN12345',
    wasteProcessingType: 'reprocessor',
    material: 'aluminium',
    accreditation: {
      id: 'acc-456',
      accreditationNumber: 'ACC123'
    }
  })

  it('returns valid result when validators pass', () => {
    const parsed = { meta: createValidMeta() }
    const registration = createValidRegistration()

    const result = validateMetaBusiness({
      parsed,
      registration,
      loggingContext: 'test'
    })

    expect(result.isValid()).toBe(true)
    expect(result.isFatal()).toBe(false)
    expect(result.hasIssues()).toBe(false)
  })

  it('returns invalid result when validators fail', () => {
    const parsed = {
      meta: {
        ...createValidMeta(),
        REGISTRATION: { value: 'WRN99999' }
      }
    }
    const registration = createValidRegistration()

    const result = validateMetaBusiness({
      parsed,
      registration,
      loggingContext: 'test'
    })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)
    expect(result.hasIssues()).toBe(true)
  })

  it('merges issues from multiple validators', () => {
    const parsed = {
      meta: {
        ...createValidMeta(),
        REGISTRATION: { value: 'WRN99999' },
        PROCESSING_TYPE: { value: 'EXPORTER' }
      }
    }
    const registration = createValidRegistration()

    const result = validateMetaBusiness({
      parsed,
      registration,
      loggingContext: 'test'
    })

    expect(result.isValid()).toBe(false)
    expect(result.isFatal()).toBe(true)

    const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
    expect(fatals.length).toBeGreaterThanOrEqual(2)

    const codes = fatals.map((f) => f.code)
    expect(codes).toContain('REGISTRATION_MISMATCH')
    expect(codes).toContain('PROCESSING_TYPE_MISMATCH')
  })
})
