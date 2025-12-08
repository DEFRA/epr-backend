/**
 * Number validation utilities for calculated field verification
 *
 * These functions help validate that calculated fields in spreadsheets
 * match their expected formula results, handling floating-point precision.
 */

/**
 * Default tolerance for floating-point comparison.
 * Small enough to catch manual entry of rounded values,
 * large enough to handle IEEE 754 representation differences.
 */
const DEFAULT_TOLERANCE = 1e-9

/**
 * Checks if two numbers are equal within a tolerance.
 *
 * Handles edge cases like Infinity and NaN appropriately.
 *
 * @param {number} actual - The actual value to check
 * @param {number} expected - The expected value
 * @param {number} [tolerance=1e-9] - Maximum allowed absolute difference
 * @returns {boolean} True if numbers are considered equal
 */
export const areNumbersEqual = (
  actual,
  expected,
  tolerance = DEFAULT_TOLERANCE
) => {
  // Handle exact equality (including +/-Infinity)
  if (actual === expected) {
    return true
  }

  // NaN is never equal to anything, including itself
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return false
  }

  return Math.abs(actual - expected) <= tolerance
}

/**
 * Validates that a calculated field equals the product of two values.
 *
 * Used for validating spreadsheet formulas like:
 * PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION = PRODUCT_TONNAGE × UK_PACKAGING_WEIGHT_PERCENTAGE
 *
 * @param {number} actual - The value in the calculated field
 * @param {number} a - First operand (e.g., PRODUCT_TONNAGE)
 * @param {number} b - Second operand (e.g., UK_PACKAGING_WEIGHT_PERCENTAGE)
 * @param {number} [tolerance] - Maximum allowed difference (defaults to 1e-9)
 * @returns {boolean} True if actual equals a × b within tolerance
 */
export const isProductCorrect = (actual, a, b, tolerance) => {
  const expected = a * b
  return areNumbersEqual(actual, expected, tolerance)
}
