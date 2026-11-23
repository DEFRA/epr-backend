import {
  calendarDate,
  formatDateISO,
  ukCalendarDate
} from '#common/helpers/date-formatter.js'
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
 *   firstOpenDay?: (activityYear: Year) => CalendarDate,
 *   lastOpenDay: (activityYear: Year) => CalendarDate
 * }} ActivityWindowRule
 */

/** @type {ActivityWindowRule} */
const prns = {
  lastOpenDay: (activityYear) =>
    formatDateISO(nextYear(activityYear), JANUARY, LAST_DAY_OF_JANUARY)
}

/**
 * The UK calendar days, both included, on which each activity is open for a
 * year. An activity without `firstOpenDay` is open from the start of time.
 */
const ACTIVITY_WINDOW_RULES = {
  summaryLogs: {
    lastOpenDay: (activityYear) =>
      formatDateISO(nextYear(activityYear), MARCH, LAST_DAY_OF_PREVIOUS_MONTH)
  },
  prns,
  decemberWaste: {
    firstOpenDay: (activityYear) =>
      calendarDate(
        `${activityYear}-${config.get('decemberWaste.windowStart')}`
      ),
    lastOpenDay: prns.lastOpenDay
  }
}

/**
 * @typedef {{ open: boolean, firstOpenDay?: CalendarDate, lastOpenDay: CalendarDate }} ActivityWindow
 */

/**
 * @param {ActivityWindowRule} rule
 * @param {Year} activityYear
 * @param {Date} asOf
 * @returns {ActivityWindow}
 */
const windowOf = (rule, activityYear, asOf) => {
  const ukDay = ukCalendarDate(asOf)
  const firstOpenDay = rule.firstOpenDay?.(activityYear)
  const lastOpenDay = rule.lastOpenDay(activityYear)
  return {
    open:
      (!firstOpenDay || ukDay.localeCompare(firstOpenDay) >= 0) &&
      ukDay.localeCompare(lastOpenDay) <= 0,
    ...(firstOpenDay && { firstOpenDay }),
    lastOpenDay
  }
}

/**
 * @param {Year} summaryLogYear
 * @param {Date} asOf
 */
export const summaryLogWindow = (summaryLogYear, asOf) =>
  windowOf(ACTIVITY_WINDOW_RULES.summaryLogs, summaryLogYear, asOf)

/**
 * When PRNs and PERNs for the year can be raised, issued or cancelled by an
 * admin.
 * @param {Year} relevantYear
 * @param {Date} asOf
 */
export const prnWindow = (relevantYear, asOf) =>
  windowOf(ACTIVITY_WINDOW_RULES.prns, relevantYear, asOf)

/**
 * @param {Year} relevantYear
 * @param {Date} asOf
 */
export const decemberWasteWindow = (relevantYear, asOf) =>
  windowOf(ACTIVITY_WINDOW_RULES.decemberWaste, relevantYear, asOf)

/**
 * @param {Year} relevantYear
 * @param {Date} asOf
 */
export const isPrnWindowOpen = (relevantYear, asOf) =>
  prnWindow(relevantYear, asOf).open

/**
 * @param {Year} relevantYear
 * @param {Date} asOf
 */
export const isDecemberWasteWindowOpen = (relevantYear, asOf) =>
  decemberWasteWindow(relevantYear, asOf).open
