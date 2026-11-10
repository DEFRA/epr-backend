import { utcCalendarDate } from '#common/helpers/date-formatter.js'
import {
  utcYearOf,
  earliestOfYearEndOrDate,
  yearBounds
} from '#common/helpers/dates/year.js'
import { statusOn } from './model.js'
import { regAccStatusByDate } from './reg-acc-status-by-date.js'
import { approvedYears } from './status-timeline.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Organisation, RegAccStatusByYear, Registration } from './model.js' */
/** @import { RegAccStatusSource } from './reg-acc-status-by-date.js' */

/**
 * The calendar years in which the organisation held an approved registration,
 * newest first, up to and including the year of `endDate`.
 *
 * @param {Organisation} organisation
 * @param {Date} endDate
 * @returns {Year[]}
 */
export const organisationYears = (organisation, endDate) => {
  const years = Object.values(organisation.registrations).flatMap(
    ({ status }) => approvedYears(status.timeline, utcCalendarDate(endDate))
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
 * Organisation and registration statuses are those at the end of the year, or
 * today while the year is current.
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
        regAccStatusByDate: { [year]: registration.regAccStatusByDate[year] }
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
 * `regAccStatusByDate` for each year the registration was approved in up to
 * `today`, or holds an accreditation for, which can be a later year.
 *
 * @param {RegAccStatusSource} registration
 * @param {CalendarDate} today
 * @returns {RegAccStatusByYear}
 */
export const regAccStatusByYear = (registration, today) => {
  const years = [
    ...approvedYears(registration.status.timeline, today),
    ...Object.keys(registration.accreditations).map(utcYearOf)
  ]

  return Object.fromEntries(
    years.map((year) => [year, regAccStatusByDate(registration, year)])
  )
}
