/**
 * A reporting-period reference: the fields that together identify one period.
 * @typedef {{ year: number, cadence: string, period: number }} PeriodRef
 */

/**
 * Stable identity string for a reporting period, keyed on year, cadence and
 * period. Used wherever periods are grouped or looked up across the reports
 * domain so the encoding stays in one place.
 * @param {PeriodRef} ref
 * @returns {string}
 */
export const periodKey = ({ year, cadence, period }) =>
  `${year}:${cadence}:${period}`
