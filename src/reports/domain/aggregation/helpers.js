import { addRounded, isZero, toDecimal } from '#common/helpers/decimal-utils.js'

/**
 * Decimal places that report tonnage values are rounded to before summing.
 * The canonical precision for the round-each-then-sum convention
 * (ADR 0027/0028), matching the waste balance.
 */
export const TONNAGE_DECIMAL_PLACES = 2

/**
 * Returns true when a field value is 'yes' (case-insensitive, trimmed).
 *
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export function isYes(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'yes'
}

export function isTonnageGreaterThanZero(tonnage) {
  return Number.isFinite(tonnage) && !isZero(tonnage)
}

/**
 * @param {string|null|undefined} address
 * @param {string|null|undefined} postcode
 * @returns {string | null}
 */
export function formatAddress(address, postcode) {
  if (address || postcode) {
    return [address, postcode].filter(Boolean).join(', ')
  }

  return null
}

/**
 * Groups items by a compound key and sums decimal tonnage per group.
 * Returns an array of `{ ...fields, tonnageDecimal }` objects.
 *
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} getKey
 * @param {(item: T) => object} getFields
 * @param {(item: T) => number} getTonnage
 */
export function groupAndSum(items, getKey, getFields, getTonnage) {
  const map = new Map()

  for (const item of items) {
    const key = getKey(item)
    const tonnage = getTonnage(item)

    if (map.has(key)) {
      const group = map.get(key)
      group.tonnageDecimal = addRounded(
        group.tonnageDecimal,
        tonnage,
        TONNAGE_DECIMAL_PLACES
      )
    } else {
      // Seed the group from zero so the first row is rounded too, not just
      // subsequent ones - otherwise single-row groups escape round-each-then-sum.
      map.set(key, {
        ...getFields(item),
        tonnageDecimal: addRounded(
          toDecimal(0),
          tonnage,
          TONNAGE_DECIMAL_PLACES
        )
      })
    }
  }

  return Array.from(map.values())
}
