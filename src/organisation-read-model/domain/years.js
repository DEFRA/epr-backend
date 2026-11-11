import { utcCalendarDate } from '#common/helpers/date-formatter.js'
import {
  utcYearOf,
  earliestOfYearEndOrDate,
  yearBounds
} from '#common/helpers/dates/year.js'
import { statusOn } from './model.js'
import { standingByDate } from './standing-by-date.js'
import { approvedYears } from './status-timeline.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Organisation, StandingByYear, Registration } from './model.js' */
/** @import { StandingSource } from './standing-by-date.js' */

/**
 * The calendar years in which the organisation held an approved registration,
 * newest first, up to and including the year of `endDate`.
 *
 * @param {Organisation} organisation
 * @param {CalendarDate} endDate
 * @returns {Year[]}
 */
export const organisationYears = (organisation, endDate) => {
  const years = Object.values(organisation.registrations).flatMap(
    ({ status }) => approvedYears(status.timeline, endDate)
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
 * in it, each with only that year's accreditation and status dates.
 * Organisation and registration statuses are those at the earlier point in time
 * of the end of the `year` or the provided `statusDate`.
 *
 * @param {Organisation} organisation
 * @param {Year} year
 * @param {Date} statusDate
 * @returns {Organisation}
 */
export const organisationInYear = (organisation, year, statusDate) => {
  const { end: endOfYear } = yearBounds(year)

  const statusCalendarDate = earliestOfYearEndOrDate(
    year,
    utcCalendarDate(statusDate)
  )
  const registrations = Object.entries(organisation.registrations)
    .filter(([, { status }]) =>
      approvedYears(status.timeline, endOfYear).includes(year)
    )
    .map(([number, registration]) => [
      number,
      {
        ...registration,
        status: {
          ...registration.status,
          current: statusOn(registration.status.timeline, statusCalendarDate)
        },
        accreditations: accreditationIn(registration.accreditations, year),
        standingByDate: { [year]: registration.standingByDate[year] }
      }
    ])

  return {
    ...organisation,
    status: {
      ...organisation.status,
      current: /** @type {Organisation['status']['current']} */ (
        statusOn(organisation.status.timeline, statusCalendarDate) ??
          organisation.status.current
      )
    },
    registrations: Object.fromEntries(registrations)
  }
}

/**
 * `standingByDate` for each year up to the year of `endDate` that the
 * registration was approved in or holds an accreditation for.
 *
 * @param {StandingSource} registration
 * @param {CalendarDate} endDate
 * @returns {StandingByYear}
 */
export const standingByYear = (registration, endDate) => {
  const lastYear = utcYearOf(endDate)
  const years = [
    ...approvedYears(registration.status.timeline, endDate),
    ...Object.keys(registration.accreditations).map(utcYearOf)
  ].filter((year) => year <= lastYear)

  return Object.fromEntries(
    years.map((year) => [year, standingByDate(registration, year)])
  )
}
