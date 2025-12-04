/**
 * Recursively removes properties with an `undefined` value from an object.
 * This is useful for cleaning up data before saving to MongoDB. Otherwise, undefined values will be saved as `null`.
 *
 * This function traverses nested objects and arrays.
 * - For **objects**, properties with `undefined` values are **removed** entirely.
 * - For **arrays**, `undefined` elements are **preserved** (to maintain array length/structure),
 * but any object *within* the array will be cleaned.
 * - `null`, `0`, empty strings (`''`), and `Date` objects are **preserved**.
 *
 * @param {Object | Array | Date | null | undefined} obj The value to process.
 * @returns {Object | Array | Date | string | number | boolean | null | undefined} The cleaned object or the original primitive/Date value.
 */
export function removeUndefinedValues(obj) {
  if (obj === null || obj === undefined) {
    return obj
  }

  // Don't process Date objects, just return them as-is
  if (obj instanceof Date) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => removeUndefinedValues(item))
  }

  if (typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => [key, removeUndefinedValues(value)])
    )
  }

  return obj
}
