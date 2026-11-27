/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { SummaryLogValidationOptions } from './validation-pipeline.js' */

/**
 * Options for an accredited summary log of `summaryLogYear`, uploaded on its
 * last day so that no date in the year is a future date.
 *
 * @param {Year} summaryLogYear
 * @returns {SummaryLogValidationOptions}
 */
export const validationOptionsIn = (summaryLogYear) => ({
  summaryLogYear,
  createdAt: new Date(`${summaryLogYear}-12-31T12:00:00.000Z`),
  registeredOnly: false,
  rejectsFutureDates: true
})
