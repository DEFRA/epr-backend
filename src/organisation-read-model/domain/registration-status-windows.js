import { calendarDate } from '#common/helpers/date-formatter.js'
import { dayBefore } from '#common/helpers/dates/calendar-day.js'
import { yearBounds } from '#common/helpers/dates/year.js'
import { regAccStatusByDate } from './reg-acc-status-by-date.js'

/** @import { CalendarDateRange } from '#common/helpers/dates/date-range.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Registration } from './model.js' */

/**
 * When a registration is registered only, and when it is accredited, in
 * `year`.
 *
 * @param {Registration} registration
 * @param {Year} year
 * @returns {{ registeredOnly: CalendarDateRange[], accredited: CalendarDateRange[] }}
 */
export const registrationStatusWindows = (registration, year) => {
  const { end } = yearBounds(year)
  const entries = Object.entries(regAccStatusByDate(registration, year))

  /** @type {{ registeredOnly: CalendarDateRange[], accredited: CalendarDateRange[] }} */
  const windows = { registeredOnly: [], accredited: [] }

  entries.forEach(([date, { status }], index) => {
    if (status !== 'cancelled') {
      const next = entries[index + 1]
      windows[status].push({
        from: calendarDate(date),
        to: next ? dayBefore(calendarDate(next[0])) : end
      })
    }
  })

  return windows
}
