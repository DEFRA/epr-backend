/**
 * A record holding a value for every one of the given keys, and no other.
 *
 * @template {string} K
 * @template V
 * @param {readonly K[]} keys
 * @param {(key: K) => V} valueFor
 * @returns {Record<K, V>}
 */
export const recordOf = (keys, valueFor) =>
  /** @type {Record<K, V>} */ (
    Object.fromEntries(keys.map((key) => [key, valueFor(key)]))
  )
