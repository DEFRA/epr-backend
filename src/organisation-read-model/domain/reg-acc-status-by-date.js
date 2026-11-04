import { calendarDate } from '#common/helpers/date-formatter.js'
import { yearBounds } from '#common/helpers/dates/year.js'
import { REGISTRATION_STATUS } from '#domain/organisations/model.js'
import {
  HELD_ACCREDITATION_STATUSES,
  REG_ACC_STATUS,
  statusOn
} from './model.js'
import { statusRanges } from './status-timeline.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { RegAccStatus, Registration, StatusTimeline } from './model.js' */

/**
 * @typedef {Pick<Registration, 'status' | 'accreditations'>} RegAccStatusSource
 */

/**
 * @param {StatusTimeline} registrationTimeline
 * @param {CalendarDate} date
 */
const hasBeenApprovedBy = (registrationTimeline, date) => {
  return statusRanges(registrationTimeline, date).approved !== undefined
}

/**
 * @param {StatusTimeline} accreditationTimeline
 * @param {CalendarDate} date
 */
const holdsAccreditationOn = (accreditationTimeline, date) => {
  const status = statusOn(accreditationTimeline, date)

  return status !== undefined && HELD_ACCREDITATION_STATUSES.has(status)
}

/**
 * @param {StatusTimeline} registrationTimeline
 * @param {StatusTimeline} accreditationTimeline
 * @param {CalendarDate} date
 * @returns {RegAccStatus | undefined}
 */
const regAccStatusOn = (registrationTimeline, accreditationTimeline, date) => {
  if (!hasBeenApprovedBy(registrationTimeline, date)) {
    return undefined
  }

  if (statusOn(registrationTimeline, date) !== REGISTRATION_STATUS.APPROVED) {
    return REG_ACC_STATUS.CANCELLED
  }

  if (holdsAccreditationOn(accreditationTimeline, date)) {
    return REG_ACC_STATUS.ACCREDITED
  }

  return REG_ACC_STATUS.REGISTERED_ONLY
}

/**
 * 1 January, then every date in `year` on which a timeline changes, oldest first.
 *
 * @param {StatusTimeline[]} timelines
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
 * @param {RegAccStatusSource} registration
 * @param {Year} year
 * @returns {Record<CalendarDate, { status: RegAccStatus }>}
 */
export const regAccStatusByDate = (registration, year) => {
  const registrationTimeline = registration.status.timeline
  const accreditationTimeline =
    registration.accreditations[year]?.status.timeline ?? []
  const dates = datesToCheck(
    [registrationTimeline, accreditationTimeline],
    year
  )

  /** @type {Record<CalendarDate, { status: RegAccStatus }>} */
  const byDate = {}
  /** @type {RegAccStatus | undefined} */
  let previous

  for (const date of dates) {
    const status = regAccStatusOn(
      registrationTimeline,
      accreditationTimeline,
      date
    )

    if (status !== undefined && status !== previous) {
      byDate[date] = { status }
      previous = status
    }
  }

  return byDate
}
