import { toYearMonth, yearOf } from '#common/helpers/dates/year-month.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { generateAllPeriodsForYear } from '#reports/domain/generate-reporting-periods.js'
import {
  accreditationsForRegistration,
  getReportableRegistrations
} from '#domain/organisations/registration-utils.js'
import {
  accreditationWindow,
  getStatusHistoryDateTimes,
  statusHeldAt
} from '#common/helpers/dates/accreditation.js'
import { toCalendarDate } from '#common/helpers/date-formatter.js'
import {
  ACCREDITATION_STATUS,
  ACTIVE_ACCREDITATION_STATUSES
} from '#domain/organisations/model.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { AccreditationWindow, StatusHistoryDateTime } from '#common/helpers/dates/accreditation.js' */

/**
 * @typedef {{ startDate: CalendarDate, endDate: CalendarDate }} Period
 */

/**
 * A registration and the organisation that holds it.
 *
 * @typedef {Object} RegistrationOfOrganisation
 * @property {Organisation} org
 * @property {Registration} registration
 */

/**
 * Whether a caller's publication covers a registration. A caller publishing
 * figures over part of the register passes one so its counts describe the
 * same operators its figures do.
 *
 * @typedef {(candidate: RegistrationOfOrganisation) => boolean} CoversRegistration
 */

/**
 * A registration whose accreditation has been granted.
 *
 * @typedef {RegistrationOfOrganisation & { accreditation: Accreditation }} GrantedRegistration
 */

/**
 * A month in which a registration was accredited for its material.
 *
 * @typedef {Object} AccreditedMonth
 * @property {YearMonth} month
 * @property {Organisation} org
 * @property {Registration} registration
 */

/**
 * Whether the accreditation has ever been granted, read from its history
 * rather than from the status it holds now. The schema makes the validity
 * dates optional rather than absent for an accreditation still created or
 * since rejected, so one that carries dates must not be walked as though it
 * were live. Reading the history keeps an approval since reverted to draft,
 * and a cancellation, on the months they held, which the validity window and
 * the status on each day then bound.
 *
 * @param {Accreditation} accreditation
 */
const hasBeenGranted = ({ statusHistory }) =>
  statusHistory.some(({ status }) => ACTIVE_ACCREDITATION_STATUSES.has(status))

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
 * @param {CalendarDate} day
 * @param {StatusHistoryDateTime[]} history
 */
const isCancelledOn = (day, history) =>
  statusHeldAt(day, history) === ACCREDITATION_STATUS.CANCELLED

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
 * @param {StatusHistoryDateTime[]} history
 */
const isAccreditedDuring = (period, window, history) =>
  daysOf(withinWindow(period, window)).some(
    (day) => !isCancelledOn(day, history)
  )

/**
 * Every registration of the register whose accreditation has been granted,
 * among those the caller's publication covers. Only an accredited registration
 * reports monthly, so a registered-only operator yields nothing.
 *
 * @param {Organisation[]} organisations
 * @param {CoversRegistration} covers
 * @returns {Generator<GrantedRegistration>}
 */
export function* grantedRegistrations(organisations, covers) {
  for (const { org, registration } of getReportableRegistrations(
    organisations
  )) {
    const [accreditation] = accreditationsForRegistration(registration, org)
    if (
      accreditation !== undefined &&
      hasBeenGranted(accreditation) &&
      covers({ org, registration })
    ) {
      yield { org, registration, accreditation }
    }
  }
}

/**
 * Every month served in which a registration was accredited for its material
 * on some day, one per accredited registration and month. A suspended
 * accreditation counts; one cancelled for the whole of the month, or outside
 * its validity window, does not.
 *
 * @param {Object} params
 * @param {Organisation[]} params.organisations
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
  const periods = [...new Set(months.map(yearOf))]
    .flatMap((year) => generateAllPeriodsForYear(CADENCE.monthly, year))
    .filter((period) => served.has(toYearMonth(period.startDate)))

  for (const { org, registration, accreditation } of grantedRegistrations(
    organisations,
    covers
  )) {
    const window = accreditationWindow(accreditation)
    if (window === null) {
      continue
    }
    const history = getStatusHistoryDateTimes(accreditation.statusHistory)
    for (const period of periods) {
      if (isAccreditedDuring(period, window, history)) {
        yield { month: toYearMonth(period.startDate), org, registration }
      }
    }
  }
}
