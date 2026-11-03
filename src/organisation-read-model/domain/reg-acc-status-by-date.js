import { calendarDate } from '#common/helpers/date-formatter.js'
import { yearBounds } from '#common/helpers/dates/year.js'
import { HELD_ACCREDITATION_STATUSES, statusOn } from './model.js'
import { dailyTimeline } from './status-timeline.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Registration, StatusTimeline } from './model.js' */

/**
 * @typedef {typeof REG_ACC_STATUSES[number]} RegAccStatus
 */

export const REG_ACC_STATUSES = /** @type {const} */ ([
  'registeredOnly',
  'accredited',
  'cancelled'
])

/**
 * @param {StatusTimeline} timeline
 * @param {CalendarDate} date
 */
const approvedOnOrBefore = (timeline, date) =>
  Object.entries(dailyTimeline(timeline)).some(
    ([day, { status }]) => status === 'approved' && day.localeCompare(date) <= 0
  )

/**
 * @param {StatusTimeline} registrationTimeline
 * @param {StatusTimeline} accreditationTimeline
 * @param {CalendarDate} date
 * @returns {RegAccStatus | undefined}
 */
const regAccStatusOn = (registrationTimeline, accreditationTimeline, date) => {
  if (!approvedOnOrBefore(registrationTimeline, date)) {
    return undefined
  }
  if (statusOn(registrationTimeline, date) !== 'approved') {
    return 'cancelled'
  }
  return HELD_ACCREDITATION_STATUSES.has(
    statusOn(accreditationTimeline, date) ?? ''
  )
    ? 'accredited'
    : 'registeredOnly'
}

/**
 * What a registration and its accreditation together amount to in `year`,
 * keyed by the date each value starts. A value holds until the next key, or the
 * end of the year.
 *
 * @param {Registration} registration
 * @param {Year} year
 * @returns {Record<CalendarDate, { status: RegAccStatus }>}
 */
export const regAccStatusByDate = (registration, year) => {
  const { start, end } = yearBounds(year)
  const registrationTimeline = registration.status.timeline
  const accreditationTimeline =
    registration.accreditations[year]?.status.timeline ?? []

  const dates = [...registrationTimeline, ...accreditationTimeline]
    .map(({ at }) => calendarDate(at))
    .filter(
      (date) => date.localeCompare(start) > 0 && date.localeCompare(end) <= 0
    )

  /** @type {Record<CalendarDate, { status: RegAccStatus }>} */
  const byDate = {}
  /** @type {RegAccStatus | undefined} */
  let previous

  for (const date of [...new Set([start, ...dates])].sort((a, b) =>
    a.localeCompare(b)
  )) {
    const status = regAccStatusOn(
      registrationTimeline,
      accreditationTimeline,
      date
    )
    if (status !== previous && status !== undefined) {
      byDate[date] = { status }
    }
    previous = status
  }

  return byDate
}
