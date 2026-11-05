import { utcCalendarDate } from '#common/helpers/date-formatter.js'
import {
  isFutureYear,
  utcYearOf,
  yearEndOrToday
} from '#common/helpers/dates/year.js'
import { REGISTRATION_STATUS } from '#domain/organisations/model.js'
import { statusOn } from './model.js'
import { regAccStatusByDate } from './reg-acc-status-by-date.js'
import { approvedYears } from './status-timeline.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Organisation, RegAccStatusByYear, Registration } from './model.js' */
/** @import { RegAccStatusSource } from './reg-acc-status-by-date.js' */

/**
 * @param {Registration} registration
 * @param {CalendarDate} today
 */
const isApprovedOn = (registration, today) =>
  statusOn(registration.status.timeline, today) === REGISTRATION_STATUS.APPROVED

/**
 * Later years a registration approved today holds an accreditation for.
 *
 * @param {Registration} registration
 * @param {CalendarDate} today
 * @param {Date} now
 * @returns {Year[]}
 */
const futureAccreditedYears = (registration, today, now) =>
  isApprovedOn(registration, today)
    ? Object.keys(registration.accreditations)
        .map(utcYearOf)
        .filter((year) => isFutureYear(year, now))
    : []

/**
 * The calendar years in which the organisation held an approved registration,
 * newest first, up to and including the current year, and any later year a
 * registration approved today holds an accreditation for.
 *
 * @param {Organisation} organisation
 * @param {Date} now
 * @returns {Year[]}
 */
export const organisationYears = (organisation, now) => {
  const today = utcCalendarDate(now)
  const years = Object.values(organisation.registrations).flatMap(
    (registration) => [
      ...approvedYears(registration.status.timeline, today),
      ...futureAccreditedYears(registration, today, now)
    ]
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
 * A later year has not happened yet, so a registration approved today is
 * taken to carry into it.
 *
 * @param {Registration} registration
 * @param {Year} year
 * @param {CalendarDate} today
 * @param {Date} now
 */
const isRegisteredIn = (registration, year, today, now) =>
  isFutureYear(year, now)
    ? isApprovedOn(registration, today)
    : approvedYears(registration.status.timeline, today).includes(year)

/**
 * @param {Registration} registration
 * @param {Year} year
 * @param {Date} now
 */
const regAccStatusIn = (registration, year, now) =>
  isFutureYear(year, now)
    ? regAccStatusByDate(registration, year)
    : registration.regAccStatusByDate[year]

/**
 * The organisation as it stood in `year`: registrations approved at any point
 * in it, or approved today for a later year, each with only that year's
 * accreditation and status dates. Organisation and registration statuses are
 * those at the end of the year, or today while the year is current or later.
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
    .filter(([, registration]) =>
      isRegisteredIn(registration, year, today, now)
    )
    .map(([number, registration]) => [
      number,
      {
        ...registration,
        status: {
          ...registration.status,
          current: statusOn(registration.status.timeline, day)
        },
        accreditations: accreditationIn(registration.accreditations, year),
        regAccStatusByDate: {
          [year]: regAccStatusIn(registration, year, now)
        }
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
