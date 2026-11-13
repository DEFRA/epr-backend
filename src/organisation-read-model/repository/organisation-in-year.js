import {
  earliestOfYearEndOrDate,
  lastDayOfYear
} from '#common/helpers/dates/year.js'
import {
  REGISTRATION_STATUSES,
  statusOn
} from '#organisation-read-model/domain/model.js'
import { approvedYears } from '#organisation-read-model/domain/status-timeline.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Organisation, Registration } from '#organisation-read-model/domain/model.js' */

/**
 * The entry of `byYear` for `year`, or none when it has none for it.
 * @template T
 * @param {Record<string, T>} byYear
 * @param {Year} year
 * @returns {Record<string, T>}
 */
const onlyYear = (byYear, year) =>
  Object.hasOwn(byYear, year) ? { [year]: byYear[year] } : {}

/**
 * The registration's status on `date`, or its current status when it had no
 * served status then, as with one approved later in the year asked for.
 *
 * @param {Registration} registration
 * @param {CalendarDate} date
 * @returns {Registration['status']['current']}
 */
const registrationStatusOn = (registration, date) => {
  const status = statusOn(registration.status.timeline, date)
  return /** @type {readonly (string | undefined)[]} */ (
    REGISTRATION_STATUSES
  ).includes(status)
    ? /** @type {Registration['status']['current']} */ (status)
    : registration.status.current
}

/**
 * The organisation as it stood in `year`: registrations approved at any point
 * in it, each with only that year's accreditation and status dates.
 * Organisation and registration statuses are those on the earlier of the end
 * of `year` and `asOfDate`.
 *
 * @param {Organisation} organisation
 * @param {Year} year
 * @param {CalendarDate} asOfDate
 * @returns {Organisation}
 */
export const organisationInYear = (organisation, year, asOfDate) => {
  const statusesAsOfDate = earliestOfYearEndOrDate(year, asOfDate)
  const endOfYear = lastDayOfYear(year)
  const registrations = Object.entries(organisation.registrations)
    .filter(([, registration]) =>
      approvedYears(registration.status.timeline, endOfYear).includes(year)
    )
    .map(([number, registration]) => [
      number,
      {
        ...registration,
        status: {
          ...registration.status,
          current: registrationStatusOn(registration, statusesAsOfDate)
        },
        accreditations: onlyYear(registration.accreditations, year),
        standingByDate: onlyYear(registration.standingByDate, year)
      }
    ])

  return {
    ...organisation,
    status: {
      ...organisation.status,
      current: /** @type {Organisation['status']['current']} */ (
        statusOn(organisation.status.timeline, statusesAsOfDate) ??
          organisation.status.current
      )
    },
    registrations: Object.fromEntries(registrations)
  }
}
