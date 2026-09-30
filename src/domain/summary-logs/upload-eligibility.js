import { isFutureYear } from '#common/helpers/dates/year.js'
import { isRegistrationActiveInYear } from '#domain/organisations/registration-utils.js'

/** @import {Registration} from '#domain/organisations/registration.js' */

/**
 * @typedef {{ eligible: true } | { eligible: false, reason: string }} UploadEligibilityResult
 */

/**
 * Whether a summary log may be created for `{registration, year}`. The
 * accreditation isn't asked for here — a year-scoped upload always uses the
 * registration's current live link, captured when the upload completes.
 *
 * @param {{
 *   registration: Registration,
 *   year: number,
 *   now?: Date
 * }} args
 * @returns {UploadEligibilityResult}
 */
export function checkSummaryLogUploadEligibility({
  registration,
  year,
  now = new Date()
}) {
  if (isFutureYear(year, now)) {
    return { eligible: false, reason: `${year} has not started yet` }
  }

  if (!isRegistrationActiveInYear(registration, year)) {
    return {
      eligible: false,
      reason: `Registration is not approved and active in ${year}`
    }
  }

  return { eligible: true }
}
