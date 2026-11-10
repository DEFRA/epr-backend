import { isRegistrationActiveInYear } from '#domain/organisations/registration-utils.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import {Registration} from '#organisation-read-model/domain/model.js' */

/**
 * @typedef {{ eligible: true } | { eligible: false, reason: string }} UploadEligibilityResult
 */

/**
 * Whether a summary log may be created for `{registration, year}`. The
 * accreditation isn't asked for here — a year-scoped upload always uses the
 * registration's current live link, captured when the upload completes.
 *
 * @param {{
 *   registration: Pick<Registration, 'status' | 'validFrom'>,
 *   year: Year,
 *   latestOpenYear: Year
 * }} args
 * @returns {UploadEligibilityResult}
 */
export function checkSummaryLogUploadEligibility({
  registration,
  year,
  latestOpenYear
}) {
  if (year > latestOpenYear) {
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
