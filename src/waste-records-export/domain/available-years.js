import { latestOpenYear } from '#common/helpers/dates/latest-open-year.js'
import { yearsWithTemplates } from '#domain/summary-logs/table-schemas/index.js'

/** @import {Year} from '#common/helpers/dates/year.js' */

/**
 * The years with a summary log template, up to the latest open year, newest
 * first.
 *
 * @param {Date} [now]
 * @returns {Year[]}
 */
export const availableWasteRecordYears = (now = new Date()) => {
  const latest = latestOpenYear(now)
  return yearsWithTemplates()
    .filter((year) => year <= latest)
    .toSorted((one, other) => other - one)
}
