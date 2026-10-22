import { yearBounds } from '#common/helpers/dates/year.js'
import {
  joinDateRanges,
  restrictDateRanges,
  subtractDateRanges
} from '#common/helpers/dates/date-range.js'
import { statusRanges } from './status-timeline.js'

/** @import { CalendarDateRange } from '#common/helpers/dates/date-range.js' */
/** @import { Registration } from './model.js' */

/**
 * @param {Registration} registration
 * @param {CalendarDateRange} year
 * @returns {CalendarDateRange[]}
 */
const registeredWindows = (registration, year) =>
  restrictDateRanges(
    statusRanges(registration.status.timeline, year.to).approved ?? [],
    year
  )

/**
 * A suspended accreditation is still accredited.
 *
 * @param {Registration} registration
 * @param {CalendarDateRange} year
 * @param {number} yearNumber
 * @returns {CalendarDateRange[]}
 */
const accreditedWindows = (registration, year, yearNumber) => {
  const held = statusRanges(
    registration.accreditations[yearNumber]?.status.timeline ?? [],
    year.to
  )
  return joinDateRanges([...(held.approved ?? []), ...(held.suspended ?? [])])
}

/**
 * When a registration is registered only, and when it is accredited, in
 * `year`.
 *
 * @param {Registration} registration
 * @param {number} year
 * @returns {{ registeredOnly: CalendarDateRange[], accredited: CalendarDateRange[] }}
 */
export const registrationStatusWindows = (registration, year) => {
  const { start, end } = yearBounds(year)
  const bounds = { from: start, to: end }
  const registered = registeredWindows(registration, bounds)
  const accredited = accreditedWindows(registration, bounds, year).flatMap(
    (window) => restrictDateRanges(registered, window)
  )

  return {
    registeredOnly: subtractDateRanges(registered, accredited),
    accredited
  }
}
