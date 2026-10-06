import { describe, expect, it } from 'vitest'
import { checkSummaryLogUploadEligibility } from './upload-eligibility.js'

/** @import {Registration} from '#domain/organisations/registration.js' */

const NOW = new Date('2026-06-15T00:00:00.000Z')

/**
 * @param {Partial<Registration>} [overrides]
 * @returns {Registration}
 */
const buildRegistration = (overrides = {}) =>
  /** @type {Registration} */ ({
    id: 'reg-1',
    status: 'approved',
    validFrom: '2025-01-01',
    statusHistory: [],
    ...overrides
  })

describe('checkSummaryLogUploadEligibility', () => {
  it('refuses a future year', () => {
    const result = checkSummaryLogUploadEligibility({
      registration: buildRegistration(),
      year: 2027,
      now: NOW
    })
    expect(result).toEqual({ eligible: false, reason: expect.any(String) })
  })

  it('refuses a registration that is not active in the year', () => {
    const registration = buildRegistration({ validFrom: '2027-01-01' })
    const result = checkSummaryLogUploadEligibility({
      registration,
      year: 2026,
      now: NOW
    })
    expect(result).toEqual({ eligible: false, reason: expect.any(String) })
  })

  it('is allowed for a year the registration is active in, regardless of accreditation', () => {
    const result = checkSummaryLogUploadEligibility({
      registration: buildRegistration(),
      year: 2026,
      now: NOW
    })
    expect(result).toEqual({ eligible: true })
  })
})
