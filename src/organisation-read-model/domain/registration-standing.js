import { calendarDate } from '#common/helpers/date-formatter.js'
import { yearBounds } from '#common/helpers/dates/year.js'
import { REGISTRATION_STATUS } from '#domain/organisations/model.js'
import { accreditationForYear } from './accreditation-for-year.js'
import { HELD_ACCREDITATION_STATUSES, STANDING, statusOn } from './model.js'
import { approvedBy, approvedYears } from './status-timeline.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { AccreditationStatus, RegistrationStatus, Standing, StandingByYear, StatusTimeline } from './model.js' */

/**
 * The timelines a registration's standing is worked out from.
 *
 * @typedef {{
 *   accreditations: Record<Year, { status: { timeline: StatusTimeline<AccreditationStatus> }, year: Year }>
 *   status: { timeline: StatusTimeline<RegistrationStatus> }
 * }} StandingSource
 */

/**
 * @param {StatusTimeline<AccreditationStatus>} accreditationTimeline
 * @param {CalendarDate} date
 */
const holdsAccreditationOn = (accreditationTimeline, date) => {
  const status = statusOn(accreditationTimeline, date)

  return status !== undefined && HELD_ACCREDITATION_STATUSES.has(status)
}

/**
 * @param {StatusTimeline<RegistrationStatus>} registrationTimeline
 * @param {StatusTimeline<AccreditationStatus>} accreditationTimeline
 * @param {CalendarDate} date
 * @returns {Standing | undefined}
 */
const standingOn = (registrationTimeline, accreditationTimeline, date) => {
  if (!approvedBy(registrationTimeline, date)) {
    return undefined
  }

  if (statusOn(registrationTimeline, date) !== REGISTRATION_STATUS.APPROVED) {
    return STANDING.CANCELLED
  }

  if (holdsAccreditationOn(accreditationTimeline, date)) {
    return STANDING.ACCREDITED
  }

  return STANDING.REGISTERED_ONLY
}

/**
 * 1 January, then every date in `year` on which a timeline changes, oldest first.
 *
 * @param {StatusTimeline<string>[]} timelines
 * @param {Year} year
 * @returns {CalendarDate[]}
 */
const datesToCheck = (timelines, year) => {
  const { start, end } = yearBounds(year)

  const changeDates = timelines.flat().map(({ at }) => calendarDate(at))
  const datesInYear = changeDates.filter(
    (date) => date.localeCompare(start) >= 0 && date.localeCompare(end) <= 0
  )
  const distinctDates = new Set([start, ...datesInYear])

  return [...distinctDates].sort((a, b) => a.localeCompare(b))
}

/**
 * What a registration and its accreditation together amount to in `year`,
 * keyed by the date each value starts. A value holds until the next key, or the
 * end of the year.
 *
 * @param {StandingSource} registration
 * @param {Year} year
 * @returns {Record<CalendarDate, { standing: Standing }>}
 */
export const standingByDate = (registration, year) => {
  const registrationTimeline = registration.status.timeline
  const accreditationTimeline =
    accreditationForYear(registration, year)?.status.timeline ?? []
  const dates = datesToCheck(
    [registrationTimeline, accreditationTimeline],
    year
  )

  /** @type {Record<CalendarDate, { standing: Standing }>} */
  const byDate = {}
  /** @type {Standing | undefined} */
  let previous

  for (const date of dates) {
    const standing = standingOn(
      registrationTimeline,
      accreditationTimeline,
      date
    )

    if (standing !== undefined && standing !== previous) {
      byDate[date] = { standing }
      previous = standing
    }
  }

  return byDate
}

/**
 * `standingByDate` for each year up to `upToYear` that the registration was
 * approved in or holds an accreditation for.
 *
 * @param {StandingSource} registration
 * @param {Year} upToYear
 * @returns {StandingByYear}
 */
export const standingByYear = (registration, upToYear) => {
  const years = new Set([
    ...approvedYears(registration.status.timeline, upToYear),
    ...Object.values(registration.accreditations).map(({ year }) => year)
  ])

  return Object.fromEntries(
    [...years]
      .filter((year) => year <= upToYear)
      .map((year) => [year, standingByDate(registration, year)])
  )
}
