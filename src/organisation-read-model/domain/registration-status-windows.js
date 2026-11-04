import { calendarDate } from '#common/helpers/date-formatter.js'
import { dayBefore } from '#common/helpers/dates/calendar-day.js'
import { yearBounds } from '#common/helpers/dates/year.js'
import { REG_ACC_STATUS } from './model.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { RegAccStatus, Registration } from './model.js' */
/** @import { CalendarDateRange } from './status-timeline.js' */

/**
 * @typedef {CalendarDateRange & { status: RegAccStatus }} Period
 */

/**
 * @param {Registration} registration
 * @param {Year} year
 * @returns {Period[]}
 */
const periodsIn = (registration, year) => {
  const { end } = yearBounds(year)
  const entries = Object.entries(registration.regAccStatusByDate[year] ?? {})

  return entries.map(([date, { status }], index) => {
    const next = entries[index + 1]
    const to = next ? dayBefore(calendarDate(next[0])) : end

    return { status, from: calendarDate(date), to }
  })
}

/**
 * @param {Period[]} periods
 * @param {RegAccStatus} status
 * @returns {CalendarDateRange[]}
 */
const rangesWithStatus = (periods, status) => {
  const matching = periods.filter((period) => period.status === status)

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
    registeredOnly: rangesWithStatus(periods, REG_ACC_STATUS.REGISTERED_ONLY),
    accredited: rangesWithStatus(periods, REG_ACC_STATUS.ACCREDITED)
  }
}
