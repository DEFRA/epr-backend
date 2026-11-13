import { toYear } from '#common/helpers/dates/year.js'
import { describe, expect, it } from 'vitest'
import { checkSummaryLogUploadEligibility } from './upload-eligibility.js'

const LATEST_OPEN_YEAR = toYear(2026)

/**
 * @param {{ approvedFrom?: string }} [options]
 */
const buildRegistration = ({ approvedFrom = '2025-01-01' } = {}) => {
  const at = new Date(approvedFrom).toISOString()
  return {
    status: {
      current: /** @type {const} */ ('approved'),
      lastUpdatedAt: at,
      timeline: [{ status: /** @type {const} */ ('approved'), at }]
    }
  }
}

describe('checkSummaryLogUploadEligibility', () => {
  it('refuses a year after the latest open year', () => {
    const result = checkSummaryLogUploadEligibility({
      registration: buildRegistration(),
      year: toYear(2027),
      latestOpenYear: LATEST_OPEN_YEAR
    })
    expect(result).toEqual({ eligible: false, reason: expect.any(String) })
  })

  it('refuses a registration that is not active in the year', () => {
    const registration = buildRegistration({ approvedFrom: '2027-01-01' })
    const result = checkSummaryLogUploadEligibility({
      registration,
      year: toYear(2026),
      latestOpenYear: LATEST_OPEN_YEAR
    })
    expect(result).toEqual({ eligible: false, reason: expect.any(String) })
  })

  it('is allowed for a year the registration is active in, regardless of accreditation', () => {
    const result = checkSummaryLogUploadEligibility({
      registration: buildRegistration(),
      year: toYear(2026),
      latestOpenYear: LATEST_OPEN_YEAR
    })
    expect(result).toEqual({ eligible: true })
  })
})
