import { toCalendarDate } from '#common/helpers/date-formatter.js'
import { yearBounds } from '#common/helpers/dates/year.js'
import { REGISTRATION_STATUS } from '#domain/organisations/model.js'
import { firstApprovedAt } from './status-timeline.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Registration } from './model.js' */

/**
 * Whether the registration is approved and active during a specific year
 * @param {Pick<Registration, 'status'>} registration
 * @param {Year} year
 * @returns {boolean}
 */
export function isRegistrationActiveInYear(registration, year) {
  if (registration.status.current !== REGISTRATION_STATUS.APPROVED) {
    return false
  }
  const approvedAt = firstApprovedAt(registration.status.timeline)
  return (
    approvedAt !== undefined &&
    toCalendarDate(approvedAt) <= yearBounds(year).end
  )
}
