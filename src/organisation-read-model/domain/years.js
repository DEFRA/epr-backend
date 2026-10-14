import { utcCalendarDate } from '#common/helpers/date-formatter.js'
import { yearEndOrToday } from '#common/helpers/dates/year.js'
import { statusOn } from './model.js'
import { approvedYears } from './status-timeline.js'

/** @import { Organisation, Registration } from './model.js' */

/**
 * The calendar years in which the organisation held an approved registration,
 * newest first, up to and including the current year.
 *
 * @param {Organisation} organisation
 * @param {Date} [now]
 * @returns {number[]}
 */
export const organisationYears = (organisation, now = new Date()) => {
  const today = utcCalendarDate(now)
  const years = Object.values(organisation.registrations).flatMap(
    ({ statusTimeline }) => approvedYears(statusTimeline, today)
  )
  return [...new Set(years)].sort((a, b) => b - a)
}

/**
 * @param {Registration['accreditations']} accreditations
 * @param {number} year
 */
const accreditationIn = (accreditations, year) =>
  Object.hasOwn(accreditations, year) ? { [year]: accreditations[year] } : {}

/**
 * The organisation as it stood in `year`: registrations approved at any point
 * in it, each with only that year's accreditation. Organisation and
 * registration statuses are those at the end of the year, or today while the
 * year is current.
 *
 * @param {Organisation} organisation
 * @param {number} year
 * @param {Date} [now]
 * @returns {Organisation}
 */
export const organisationInYear = (organisation, year, now = new Date()) => {
  const today = utcCalendarDate(now)
  const day = yearEndOrToday(year, today)
  const registrations = Object.entries(organisation.registrations)
    .filter(([, { statusTimeline }]) =>
      approvedYears(statusTimeline, today).includes(year)
    )
    .map(([number, registration]) => [
      number,
      {
        ...registration,
        status: statusOn(registration.statusTimeline, day),
        accreditations: accreditationIn(registration.accreditations, year)
      }
    ])

  return {
    ...organisation,
    status: /** @type {Organisation['status']} */ (
      statusOn(organisation.statusTimeline, day) ?? organisation.status
    ),
    registrations: Object.fromEntries(registrations)
  }
}
