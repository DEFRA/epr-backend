import {
  roundToTwoDecimalPlaces,
  subtract
} from '#common/helpers/decimal-utils.js'

/**
 * Every per-row tonnage and weight quantity the committed row-state collection
 * stores. The domain rule is that stored tonnages are held to two decimal
 * places, so storing them pre-rounded makes every downstream reader inherit
 * round-each-then-sum, matching the waste-balance convention (ADR 0027/0028) so
 * aggregated totals reconcile instead of drifting by a sum-then-round residual.
 * These are the fields validated as weight/tonnage quantities by the weight-field
 * schema helpers — `createWeightFieldSchema` in the standard tables and, in the
 * registered-only tables, the `createUnboundedWeightFieldSchema` variant;
 * `transactionAmount` is computed and already 2dp, so it is not listed.
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

const NET_WEIGHT_COMPONENT_FIELDS = Object.freeze([
  'GROSS_WEIGHT',
  'TARE_WEIGHT',
  'PALLET_WEIGHT'
])

/**
 * Ingest validates NET_WEIGHT = GROSS_WEIGHT − TARE_WEIGHT − PALLET_WEIGHT on
 * the full-precision submission. Rounding each of the four fields independently
 * can shift that identity by a penny in the stored row, so once the components
 * are coerced the stored NET is re-derived from them by exact decimal
 * subtraction (already 2dp, as the components are) — leaving the row reconciled
 * by construction. Only applies when all four fields are present as numbers; the
 * identity is undefined otherwise, so NET keeps its own rounding.
 *
 * @param {Record<string, any>} coerced
 */
const reconcileNetWeight = (coerced) => {
  const allPresent = ['NET_WEIGHT', ...NET_WEIGHT_COMPONENT_FIELDS].every(
    (field) => typeof coerced[field] === 'number'
  )
  if (!allPresent) {
    return
  }
  const [gross, tare, pallet] = NET_WEIGHT_COMPONENT_FIELDS.map(
    (field) => coerced[field]
  )
  coerced.NET_WEIGHT = subtract(subtract(gross, tare), pallet).toNumber()
}

/**
 * Return a shallow copy of a row's data with each stored tonnage/weight field
 * coerced to two decimal places (ROUND_HALF_UP), and NET_WEIGHT re-derived from
 * its coerced components so the stored row reconciles by construction.
 * Non-numeric or absent fields, and every other field, are left exactly as
 * submitted.
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
  reconcileNetWeight(coerced)
  return coerced
}
