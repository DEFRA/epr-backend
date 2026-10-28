import { utcCalendarDate } from '#common/helpers/date-formatter.js'
import { yearEndOrToday } from '#common/helpers/dates/year.js'
import { statusOn } from './model.js'
import { approvedYears } from './status-timeline.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Organisation, Registration } from './model.js' */

/**
 * The calendar years in which the organisation held an approved registration,
 * newest first, up to and including the current year.
 *
 * @param {Organisation} organisation
 * @param {Date} now
 * @returns {Year[]}
 */
export const organisationYears = (organisation, now) => {
  const today = utcCalendarDate(now)
  const years = Object.values(organisation.registrations).flatMap(
    ({ status }) => approvedYears(status.timeline, today)
  )
  return [...new Set(years)].sort((a, b) => b - a)
}

/**
 * @param {Registration['accreditations']} accreditations
 * @param {Year} year
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
 * @param {Year} year
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
        accreditations: accreditationIn(registration.accreditations, year)
      }
    ])

  return {
    ...organisation,
    status: {
      ...organisation.status,
      current: /** @type {Organisation['status']['current']} */ (
        statusOn(organisation.status.timeline, day) ??
          organisation.status.current
      )
    },
    registrations: Object.fromEntries(registrations)
  }
}
