import { roundToTwoDecimalPlaces } from '#common/helpers/decimal-utils.js'

/**
 * The per-row tonnage fields the monthly report aggregation sums across rows.
 * Storing them pre-rounded in the committed row-state collection makes every
 * downstream reader inherit round-each-then-sum, matching the waste-balance
 * convention (ADR 0027/0028) so report totals reconcile with the waste balance
 * instead of drifting by a sum-then-round residual.
 *
 * @type {readonly string[]}
 */
export const REPORT_FACING_TONNAGE_FIELDS = Object.freeze([
  'TONNAGE_RECEIVED_FOR_RECYCLING',
  'TONNAGE_RECEIVED_FOR_EXPORT',
  'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED',
  'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
])

/**
 * Return a shallow copy of a row's data with each report-facing tonnage field
 * coerced to two decimal places (ROUND_HALF_UP). Non-numeric or absent fields,
 * and every other field, are left exactly as submitted.
 *
 * @param {Record<string, any>} data
 * @returns {Record<string, any>}
 */
export const coerceReportTonnages = (data) => {
  const coerced = { ...data }
  for (const field of REPORT_FACING_TONNAGE_FIELDS) {
    if (typeof coerced[field] === 'number') {
      coerced[field] = roundToTwoDecimalPlaces(coerced[field])
    }
  }
  return coerced
}
