/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { SummaryLogValidationOptions } from './validation-pipeline.js' */

/**
 * Options for an accredited summary log of `summaryLogYear`, created mid-year.
 *
 * @param {Year} summaryLogYear
 * @returns {SummaryLogValidationOptions}
 */
export const validationOptionsIn = (summaryLogYear) => ({
  summaryLogYear,
  createdAt: new Date(`${summaryLogYear}-06-01T09:00:00.000Z`),
  registeredOnly: false
})
