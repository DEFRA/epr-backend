import { calendarDate } from '#common/helpers/date-formatter.js'
import { dayBefore } from '#common/helpers/dates/calendar-day.js'
import { yearBounds } from '#common/helpers/dates/year.js'
import { STANDING } from './model.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Standing, Registration } from './model.js' */
/** @import { CalendarDateRange } from './status-timeline.js' */

/**
 * @typedef {CalendarDateRange & { standing: Standing }} Period
 */

/**
 * @param {Registration} registration
 * @param {Year} year
 * @returns {Period[]}
 */
const periodsIn = (registration, year) => {
  const { end } = yearBounds(year)
  const entries = Object.entries(registration.standingByDate[year] ?? {})

  return entries.map(([date, { standing }], index) => {
    const next = entries[index + 1]
    const to = next ? dayBefore(calendarDate(next[0])) : end

    return { standing, from: calendarDate(date), to }
  })
}

/**
 * @param {Period[]} periods
 * @param {Standing} standing
 * @returns {CalendarDateRange[]}
 */
const rangesWithStanding = (periods, standing) => {
  const matching = periods.filter((period) => period.standing === standing)

  return matching.map(({ from, to }) => ({ from, to }))
}

/**
 * When a registration is registered only, and when it is accredited, in
 * `year`.
 *
 * @param {Registration} registration
 * @param {Year} year
 * @returns {{ registeredOnly: CalendarDateRange[], accredited: CalendarDateRange[] }}
 */
export const registrationStatusWindows = (registration, year) => {
  const periods = periodsIn(registration, year)

  return {
    registeredOnly: rangesWithStanding(periods, STANDING.REGISTERED_ONLY),
    accredited: rangesWithStanding(periods, STANDING.ACCREDITED)
  }
}
