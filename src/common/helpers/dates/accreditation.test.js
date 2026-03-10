import { describe, expect, it } from 'vitest'
import { isWithinAccreditationDateRange } from './accreditation.js'

describe('isWithinAccreditationDateRange', () => {
  const accreditation = {
    validFrom: '2025-01-01',
    validTo: '2025-12-31'
  }

  it('returns true when date is within range', () => {
    expect(isWithinAccreditationDateRange('2025-06-15', accreditation)).toBe(
      true
    )
  })

  it('returns true when date equals validFrom', () => {
    expect(isWithinAccreditationDateRange('2025-01-01', accreditation)).toBe(
      true
    )
  })

  it('returns true when date equals validTo', () => {
    expect(isWithinAccreditationDateRange('2025-12-31', accreditation)).toBe(
      true
    )
  })

  it('returns false when date is before range', () => {
    expect(isWithinAccreditationDateRange('2024-12-31', accreditation)).toBe(
      false
    )
  })

  it('returns false when date is after range', () => {
    expect(isWithinAccreditationDateRange('2026-01-01', accreditation)).toBe(
      false
    )
  })

  it('returns true when accreditation is null', () => {
    expect(isWithinAccreditationDateRange('2025-06-15', null)).toBe(true)
  })

  it('returns true when accreditation is undefined', () => {
    expect(isWithinAccreditationDateRange('2025-06-15', undefined)).toBe(true)
  })
})
