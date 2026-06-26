import { roundToTwoDecimalPlaces } from '#common/helpers/decimal-utils.js'

/**
 * Every per-row tonnage and weight quantity the committed row-state collection
 * stores. The domain rule is that stored tonnages are held to two decimal
 * places, so storing them pre-rounded makes every downstream reader inherit
 * round-each-then-sum, matching the waste-balance convention (ADR 0027/0028) so
 * aggregated totals reconcile instead of drifting by a sum-then-round residual.
 * These are the `createWeightFieldSchema`-validated fields; `transactionAmount`
 * is computed and already 2dp, so it is not listed.
 *
 * @type {readonly string[]}
 */
export const STORED_TONNAGE_FIELDS = Object.freeze([
  'GROSS_WEIGHT',
  'TARE_WEIGHT',
  'PALLET_WEIGHT',
  'NET_WEIGHT',
  'WEIGHT_OF_NON_TARGET_MATERIALS',
  'TONNAGE_RECEIVED_FOR_RECYCLING',
  'TONNAGE_RECEIVED_FOR_EXPORT',
  'TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR',
  'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED',
  'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON',
  'PRODUCT_TONNAGE',
  'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION'
])

/**
 * Return a shallow copy of a row's data with each stored tonnage/weight field
 * coerced to two decimal places (ROUND_HALF_UP). Non-numeric or absent fields,
 * and every other field, are left exactly as submitted.
 *
 * @param {Record<string, any>} data
 * @returns {Record<string, any>}
 */
export const coerceStoredTonnages = (data) => {
  const coerced = { ...data }
  for (const field of STORED_TONNAGE_FIELDS) {
    if (typeof coerced[field] === 'number') {
      coerced[field] = roundToTwoDecimalPlaces(coerced[field])
    }
  }
  return coerced
}
