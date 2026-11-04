import { toYear } from '#common/helpers/dates/year.js'
import { describe, expect, it } from 'vitest'
import { checkSummaryLogUploadEligibility } from './upload-eligibility.js'

const NOW = new Date('2026-06-15T00:00:00.000Z')

/**
 * @param {{ validFrom?: string }} [overrides]
 */
const buildRegistration = (overrides = {}) => ({
  status: { current: /** @type {const} */ ('approved'), timeline: [] },
  validFrom: '2025-01-01',
  ...overrides
})

describe('checkSummaryLogUploadEligibility', () => {
  it('refuses a future year', () => {
    const result = checkSummaryLogUploadEligibility({
      registration: buildRegistration(),
      year: toYear(2027),
      now: NOW
    })
    expect(result).toEqual({ eligible: false, reason: expect.any(String) })
  })

  it('refuses a registration that is not active in the year', () => {
    const registration = buildRegistration({ validFrom: '2027-01-01' })
    const result = checkSummaryLogUploadEligibility({
      registration,
      year: toYear(2026),
      now: NOW
    })
    expect(result).toEqual({ eligible: false, reason: expect.any(String) })
  })

  it('is allowed for a year the registration is active in, regardless of accreditation', () => {
    const result = checkSummaryLogUploadEligibility({
      registration: buildRegistration(),
      year: toYear(2026),
      now: NOW
    })
    expect(result).toEqual({ eligible: true })
  })
})
