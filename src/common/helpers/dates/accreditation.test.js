import { getDateRangeStatus } from './accreditation.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

describe('getDateRangeStatus', () => {
  const accreditation = { validFrom: '2025-01-01', validTo: '2025-12-31' }

  it('should return null when all dates are within range', () => {
    const result = getDateRangeStatus(['2025-06-15'], accreditation)

    expect(result).toBeNull()
  })

  it('should return IGNORED when a date is before the range', () => {
    const result = getDateRangeStatus(['2024-11-01'], accreditation)

    expect(result).toBe(ROW_OUTCOME.IGNORED)
  })

  it('should return IGNORED when a date is after the range', () => {
    const result = getDateRangeStatus(['2026-02-01'], accreditation)

    expect(result).toBe(ROW_OUTCOME.IGNORED)
  })

  it('should skip null dates and check remaining dates', () => {
    const result = getDateRangeStatus([null, '2025-06-15'], accreditation)

    expect(result).toBeNull()
  })

  it('should skip undefined dates and check remaining dates', () => {
    const result = getDateRangeStatus([undefined, '2025-06-15'], accreditation)

    expect(result).toBeNull()
  })

  it('should return null for an empty dates array', () => {
    const result = getDateRangeStatus([], accreditation)

    expect(result).toBeNull()
  })

  it('should return IGNORED if first truthy date is outside range even if later dates are inside', () => {
    const result = getDateRangeStatus(
      ['2024-11-01', '2025-06-15'],
      accreditation
    )

    expect(result).toBe(ROW_OUTCOME.IGNORED)
  })

  it('should return null when date is on the validFrom boundary', () => {
    const result = getDateRangeStatus(['2025-01-01'], accreditation)

    expect(result).toBeNull()
  })

  it('should return null when date is on the validTo boundary', () => {
    const result = getDateRangeStatus(['2025-12-31'], accreditation)

    expect(result).toBeNull()
  })
})
