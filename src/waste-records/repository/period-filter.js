/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { WasteRecordType } from '#domain/waste-records/model.js' */
import { toYearMonth } from '#common/helpers/dates/year-month.js'

/**
 * Which rows place themselves in a reporting period: those whose value in any
 * of `dateFields` falls between the dates, plus rows of the `undated` type
 * with no value in its date field.
 *
 * @typedef {Object} PeriodFilter
 * @property {string[]} dateFields
 * @property {CalendarDate} startDate - first day of a month
 * @property {CalendarDate} endDate - last day of a month
 * @property {{ wasteRecordType: WasteRecordType, dateField: string }} undated
 */

/**
 * Month-prefix bounds, so `YYYY-MM`, `YYYY-MM-DD` and full ISO datetimes all
 * compare correctly as strings.
 *
 * @param {PeriodFilter} filter
 * @returns {{ from: string, before: string }}
 */
export const monthPrefixBounds = ({ startDate, endDate }) => {
  const [year, month] = endDate.split('-').map(Number)
  return {
    from: toYearMonth(startDate),
    before: toYearMonth(new Date(Date.UTC(year, month, 1)).toISOString())
  }
}
