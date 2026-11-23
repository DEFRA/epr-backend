import { calendarDate, formatDateISO } from '#common/helpers/date-formatter.js'
import { nextYear } from '#common/helpers/dates/year.js'
import { config } from '#root/config.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */

const JANUARY = 0
const MARCH = 2
const LAST_DAY_OF_JANUARY = 31
const LAST_DAY_OF_PREVIOUS_MONTH = 0

/**
 * @typedef {{
 *   firstOpenDay?: (year: Year) => CalendarDate,
 *   lastOpenDay: (year: Year) => CalendarDate
 * }} YearActivityRule
 */

/** @type {YearActivityRule} */
const prns = {
  lastOpenDay: (year) =>
    formatDateISO(nextYear(year), JANUARY, LAST_DAY_OF_JANUARY)
}

/**
 * The UK calendar days, both included, on which each activity is open for a
 * year. An activity without `firstOpenDay` is open from the start of time.
 *
 * @type {{
 *   summaryLogs: YearActivityRule,
 *   prns: YearActivityRule,
 *   decemberWaste: YearActivityRule
 * }}
 */
export const YEAR_ACTIVITY_RULES = {
  summaryLogs: {
    lastOpenDay: (year) =>
      formatDateISO(nextYear(year), MARCH, LAST_DAY_OF_PREVIOUS_MONTH)
  },
  prns,
  decemberWaste: {
    firstOpenDay: (year) =>
      calendarDate(`${year}-${config.get('decemberWaste.windowStart')}`),
    lastOpenDay: prns.lastOpenDay
  }
}

/** @typedef {keyof typeof YEAR_ACTIVITY_RULES} YearActivity */

/**
 * @param {YearActivity} activity
 * @param {Year} year
 * @param {CalendarDate} date - a UK calendar date
 */
const isOpen = (activity, year, date) =>
  yearActivityState(activity, year, date).open

/**
 * @param {Year} year
 * @param {CalendarDate} date - a UK calendar date
 */
export const isSummaryLogYearOpen = (year, date) =>
  isOpen('summaryLogs', year, date)

/**
 * Whether PRNs and PERNs for the year can still be raised, issued or
 * cancelled by an admin.
 * @param {Year} year
 * @param {CalendarDate} date - a UK calendar date
 */
export const isPrnYearOpen = (year, date) => isOpen('prns', year, date)

/**
 * @param {Year} year
 * @param {CalendarDate} date - a UK calendar date
 */
export const isDecemberWasteOpen = (year, date) =>
  isOpen('decemberWaste', year, date)

/**
 * @param {YearActivity} activity
 * @param {Year} year
 * @param {CalendarDate} date - a UK calendar date
 * @returns {{ open: boolean, firstOpenDay?: CalendarDate, lastOpenDay: CalendarDate }}
 */
export const yearActivityState = (activity, year, date) => {
  const rule = YEAR_ACTIVITY_RULES[activity]
  const firstOpenDay = rule.firstOpenDay?.(year)
  const lastOpenDay = rule.lastOpenDay(year)
  return {
    open: (!firstOpenDay || date >= firstOpenDay) && date <= lastOpenDay,
    ...(firstOpenDay && { firstOpenDay }),
    lastOpenDay
  }
}
