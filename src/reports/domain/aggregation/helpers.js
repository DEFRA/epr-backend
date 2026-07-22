import { isZero } from '#common/helpers/decimal-utils.js'
import { addTonnage } from '#common/helpers/rounded-tonnage.js'

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
 * The row tonnages come from the row-state collection, which stores them
 * already rounded to two decimal places, so the sum is exact — the group
 * total inherits that precision without any rounding of its own.
 * Returns an array of `{ ...fields, tonnageDecimal }` objects.
 *
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} getKey
 * @param {(item: T) => object} getFields
 * @param {(item: T) => import('#common/helpers/rounded-tonnage.js').RoundedTonnage} getTonnage
 */
export function groupAndSum(items, getKey, getFields, getTonnage) {
  const map = new Map()

  for (const item of items) {
    const key = getKey(item)
    const tonnage = getTonnage(item)

    if (map.has(key)) {
      const group = map.get(key)
      group.tonnageDecimal = addTonnage(group.tonnageDecimal, tonnage)
    } else {
      map.set(key, {
        ...getFields(item),
        tonnageDecimal: tonnage
      })
    }
  }

  return Array.from(map.values())
}
