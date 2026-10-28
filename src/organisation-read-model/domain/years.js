import { utcCalendarDate } from '#common/helpers/date-formatter.js'
import { yearEndOrToday } from '#common/helpers/dates/year.js'
import { statusOn } from './model.js'
import { approvedYears } from './status-timeline.js'

/** @import { Organisation, Registration, Status } from './model.js' */

/**
 * The calendar years in which the organisation held an approved registration,
 * newest first, up to and including the current year.
 *
 * @param {Organisation} organisation
 * @param {Date} now
 * @returns {number[]}
 */
export const organisationYears = (organisation, now) => {
  const today = utcCalendarDate(now)
  const years = Object.values(organisation.registrations).flatMap(
    ({ status }) => approvedYears(status.timeline, today)
  )
  return [...new Set(years)].sort((a, b) => b - a)
}

/**
 * The status as it stood on `day`, or as it stands today when the timeline
 * starts later.
 *
 * @template {string} S
 * @param {Status<S>} status
 * @param {string} day - ISO 8601 date
 * @returns {Status<S>}
 */
const statusAt = (status, day) => ({
  ...status,
  current: /** @type {S} */ (statusOn(status.timeline, day) ?? status.current)
})

/**
 * @param {Registration['accreditations']} accreditations
 * @param {number} year
 * @param {string} day - ISO 8601 date
 */
const accreditationIn = (accreditations, year, day) => {
  if (!Object.hasOwn(accreditations, year)) {
    return {}
  }
  const accreditation = accreditations[year]
  return {
    [year]: { ...accreditation, status: statusAt(accreditation.status, day) }
  }
}

/**
 * The organisation as it stood in `year`: registrations approved at any point
 * in it, each with only that year's accreditation. Organisation, registration
 * and accreditation statuses are those at the end of the year, or today while
 * the year is current.
 *
 * @param {Organisation} organisation
 * @param {number} year
 * @param {Date} now
 * @returns {Organisation}
 */
export const organisationInYear = (organisation, year, now) => {
  const today = utcCalendarDate(now)
  const day = yearEndOrToday(year, today)
  const registrations = Object.entries(organisation.registrations)
    .filter(([, { status }]) =>
      approvedYears(status.timeline, today).includes(year)
    )
    .map(([number, registration]) => [
      number,
      {
        ...registration,
        status: {
          ...registration.status,
          current: statusOn(registration.status.timeline, day)
        },
        accreditations: accreditationIn(registration.accreditations, year, day)
      }
    ])

  return {
    ...organisation,
    status: statusAt(organisation.status, day),
    registrations: Object.fromEntries(registrations)
  }
}
