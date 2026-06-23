/**
 * Returns the values that appear more than once, each listed a single time in
 * the order their duplication was first detected.
 *
 * @param {string[]} values
 * @returns {string[]}
 */
export const findDuplicates = (values) => {
  const seen = new Set()
  const duplicates = new Set()
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value)
    } else {
      seen.add(value)
    }
  }
  return [...duplicates]
}
