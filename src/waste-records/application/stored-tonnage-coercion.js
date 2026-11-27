import {
  roundToTwoDecimalPlaces,
  subtract
} from '#common/helpers/decimal-utils.js'
import { STORED_TONNAGE_FIELDS } from '#domain/summary-logs/stored-tonnage-fields.js'

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
