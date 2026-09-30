import { toCalendarDate } from '#common/helpers/date-formatter.js'
import { REGISTRATION_STATUS } from '#domain/organisations/model.js'
import { yearBounds } from '#common/helpers/dates/year.js'

/** @import {Registration} from '#domain/organisations/registration.js' */

/**
 * Whether the registration was open for business at some point during
 * `year` — approved, and approved on or before the year ends. A registration
 * never carries a `validTo` (it doesn't expire), so a later cancellation
 * doesn't retroactively close a year it was already approved for.
 * @param {Registration} registration
 * @param {number} year
 * @returns {boolean}
 */
export function isRegistrationActiveInYear(registration, year) {
  if (registration.status !== REGISTRATION_STATUS.APPROVED) {
    return false
  }
  return toCalendarDate(registration.validFrom) <= yearBounds(year).end
}
