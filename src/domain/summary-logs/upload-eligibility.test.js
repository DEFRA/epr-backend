import { toYear } from '#common/helpers/dates/year.js'
import { describe, expect, it } from 'vitest'
import { checkSummaryLogUploadEligibility } from './upload-eligibility.js'

const LATEST_OPEN_YEAR = toYear(2026)

/**
 * @param {{ validFrom?: string }} [overrides]
 */
const buildRegistration = (overrides = {}) => ({
  status: { current: /** @type {const} */ ('approved'), timeline: [] },
  validFrom: '2025-01-01',
  ...overrides
})

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
    const registration = buildRegistration({ validFrom: '2027-01-01' })
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

  it.each([2024, 2025])(
    'refuses %s, a year with no summary log templates',
    (year) => {
      const result = checkSummaryLogUploadEligibility({
        registration: buildRegistration({ validFrom: '2024-01-01' }),
        year: toYear(year),
        latestOpenYear: LATEST_OPEN_YEAR
      })
      expect(result).toEqual({
        eligible: false,
        reason: `There are no summary log templates for ${year}`
      })
    }
  )

  it('refuses an open year with no summary log templates', () => {
    const result = checkSummaryLogUploadEligibility({
      registration: buildRegistration(),
      year: toYear(2028),
      latestOpenYear: toYear(2028)
    })
    expect(result).toEqual({
      eligible: false,
      reason: 'There are no summary log templates for 2028'
    })
  })

  it('is allowed for 2027 once it is open', () => {
    const result = checkSummaryLogUploadEligibility({
      registration: buildRegistration(),
      year: toYear(2027),
      latestOpenYear: toYear(2027)
    })
    expect(result).toEqual({ eligible: true })
  })
})
