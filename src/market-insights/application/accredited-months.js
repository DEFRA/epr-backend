import { toYearMonth, yearOf } from '#common/helpers/dates/year-month.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { generateAllPeriodsForYear } from '#reports/domain/generate-reporting-periods.js'
import { reportableRegistrations } from '#reports/application/reportable-registrations.js'
import { validityOf } from '#waste-balances/application/read-model-accreditations.js'
import { accreditationWindow } from '#common/helpers/dates/accreditation.js'
import { toCalendarDate } from '#common/helpers/date-formatter.js'
import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'
import { statusOn } from '#organisation-read-model/domain/model.js'
import { accreditationForYear } from '#organisation-read-model/domain/accreditation-for-year.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { AccreditationValidity } from '#domain/organisations/accreditation.js' */
/** @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { AccreditationStatus, Organisation, Registration, StatusTimeline } from '#organisation-read-model/domain/model.js' */
/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { AccreditationWindow } from '#common/helpers/dates/accreditation.js' */

/**
 * @typedef {{ startDate: CalendarDate, endDate: CalendarDate }} Period
 */

/**
 * A registration and the organisation that holds it, by their numbers.
 *
 * @typedef {Object} RegistrationOfOrganisation
 * @property {OrganisationNumber} organisationNumber
 * @property {RegistrationNumber} registrationNumber
 * @property {Registration} registration
 */

/**
 * A registration and the year of the accreditation it holds.
 *
 * @typedef {RegistrationOfOrganisation & { year: Year }} AccreditationOfRegistration
 */

/**
 * Whether a caller's publication covers a registration's accreditation for a
 * year. A caller publishing figures over part of the register passes one so
 * its counts describe the same operators its figures do.
 *
 * @typedef {(candidate: AccreditationOfRegistration) => boolean} CoversRegistration
 */

/**
 * A registration whose accreditation for a year has been granted.
 *
 * @typedef {AccreditationOfRegistration & {
 *   key: string,
 *   accreditation: AccreditationValidity,
 *   window: AccreditationWindow
 * }} GrantedRegistration
 */

/**
 * A month in which a registration was accredited for its material.
 *
 * @typedef {RegistrationOfOrganisation & { month: YearMonth }} AccreditedMonth
 */

/**
 * Every day of a period, as the bare dates a load can carry.
 *
 * @param {Period} period
 * @returns {CalendarDate[]}
 */
const daysOf = ({ startDate, endDate }) => {
  const days = []
  for (
    const day = new Date(startDate);
    toCalendarDate(day).localeCompare(endDate) <= 0;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    days.push(toCalendarDate(day))
  }
  return days
}

/**
 * The last status on a day holds for the whole day.
 *
 * @param {CalendarDate} day
 * @param {StatusTimeline<AccreditationStatus>} timeline
 */
const isCancelledOn = (day, timeline) =>
  statusOn(timeline, day) === ACCREDITATION_STATUS.CANCELLED

/**
 * The days of the period inside the accreditation's validity window, none
 * when the two do not overlap.
 *
 * @param {Period} period
 * @param {AccreditationWindow} window
 * @returns {Period}
 */
const withinWindow = ({ startDate, endDate }, { validFrom, validTo }) => ({
  startDate: startDate.localeCompare(validFrom) < 0 ? validFrom : startDate,
  endDate: endDate.localeCompare(validTo) > 0 ? validTo : endDate
})

/**
 * Whether the accreditation was accredited on some day of the period: a day
 * inside its validity window on which it did not stand cancelled. A suspended
 * accreditation is still accredited, and so is a day in a window backdated
 * before the approval, as the figures accept a load dated that day.
 *
 * @param {Period} period
 * @param {AccreditationWindow} window
 * @param {StatusTimeline<AccreditationStatus>} timeline
 */
const isAccreditedDuring = (period, window, timeline) =>
  daysOf(withinWindow(period, window)).some(
    (day) => !isCancelledOn(day, timeline)
  )

/**
 * Every accreditation the read model serves for the years given, outside test
 * organisations, that has been approved, with its validity window.
 *
 * @param {Organisation[]} organisations
 * @param {Year[]} years
 * @returns {GrantedRegistration[]}
 */
const everyGranted = (organisations, years) =>
  reportableRegistrations(organisations).flatMap(
    ({ organisationNumber, registrationNumber, registration, key }) =>
      years.flatMap((year) => {
        const held = accreditationForYear(registration, year)
        if (held === undefined) {
          return []
        }
        const accreditation = validityOf(held)
        const window = accreditationWindow(accreditation)
        return window === null
          ? []
          : [
              {
                organisationNumber,
                registrationNumber,
                registration,
                year,
                key,
                accreditation,
                window
              }
            ]
      })
  )

/**
 * Each register's granted accreditations by the years asked for. The figures
 * for one publication share one register, so they work these out once.
 *
 * @type {WeakMap<Organisation[], Map<string, GrantedRegistration[]>>}
 */
const grantedByRegister = new WeakMap()

/**
 * Every accreditation the read model serves for the years given, outside test
 * organisations, that has been approved, with its validity window, among those
 * the caller's publication covers. Only an accredited registration reports
 * monthly, so a registered-only operator yields nothing.
 *
 * @param {Organisation[]} organisations
 * @param {Year[]} years
 * @param {CoversRegistration} covers
 * @returns {GrantedRegistration[]}
 */
export const grantedRegistrations = (organisations, years, covers) => {
  const byYears = grantedByRegister.get(organisations) ?? new Map()
  grantedByRegister.set(organisations, byYears)
  const yearsKey = years.join()
  if (!byYears.has(yearsKey)) {
    byYears.set(yearsKey, everyGranted(organisations, years))
  }
  return byYears.get(yearsKey).filter(covers)
}

/**
 * Every month served in which a registration was accredited for its material
 * on some day, one per accredited registration and month. A suspended
 * accreditation counts; one cancelled for the whole of the month, or outside
 * its validity window, does not.
 *
 * @param {Object} params
 * @param {Organisation[]} params.organisations - as the organisation read model serves them
 * @param {YearMonth[]} params.months - the reporting months served
 * @param {CoversRegistration} [params.covers] - narrows the walk to the registrations a caller publishes
 * @returns {Generator<AccreditedMonth>}
 */
export function* accreditedMonths({
  organisations,
  months,
  covers = () => true
}) {
  const served = new Set(months)
  const years = [...new Set(months.map(yearOf))]
  const periods = years
    .flatMap((year) => generateAllPeriodsForYear(CADENCE.monthly, year))
    .filter((period) => served.has(toYearMonth(period.startDate)))

  for (const {
    organisationNumber,
    registrationNumber,
    registration,
    accreditation,
    window
  } of grantedRegistrations(organisations, years, covers)) {
    for (const period of periods) {
      if (isAccreditedDuring(period, window, accreditation.timeline)) {
        yield {
          month: toYearMonth(period.startDate),
          organisationNumber,
          registrationNumber,
          registration
        }
      }
    }
  }
}
