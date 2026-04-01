import { add, isZero, toDecimal } from '#common/helpers/decimal-utils.js'

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
      map.get(key).tonnageDecimal = add(map.get(key).tonnageDecimal, tonnage)
    } else {
      map.set(key, { ...getFields(item), tonnageDecimal: toDecimal(tonnage) })
    }
  }

  return Array.from(map.values())
}
