import DecimalBase from 'decimal.js'

/** @type {any} */
const Decimal = DecimalBase

/**
 * Configure Decimal.js for financial calculations
 * - Precision: 34 significant digits (matches MongoDB Decimal128 spec)
 * - Rounding: ROUND_HALF_UP (standard financial rounding)
 */
const ConfiguredDecimal = Decimal.clone({
  precision: 34,
  rounding: Decimal.ROUND_HALF_UP
})

/**
 * Convert a value to a Decimal instance.
 * Handles numbers, strings, Decimal instances, null, and undefined.
 *
 * @param {number|string|Decimal|null|undefined} value - Value to convert
 * @returns {Decimal} Decimal instance (0 for null/undefined)
 */
export function toDecimal(value) {
  if (value === null || value === undefined) {
    return new ConfiguredDecimal(0)
  }
  if (value instanceof ConfiguredDecimal) {
    return value
  }
  return new ConfiguredDecimal(value)
}

/**
 * Convert a Decimal instance back to a JavaScript number.
 * Used when saving values to the database.
 *
 * @param {any} value - Value to convert
 * @returns {number} JavaScript number
 */
export function toNumber(value) {
  if (value === null || value === undefined) {
    return 0
  }
  if (value instanceof /** @type {any} */ (DecimalBase)) {
    return value.toNumber()
  }
  return Number(value)
}

/**
 * Add two values using exact decimal arithmetic.
 *
 * @param {number|string|Decimal} a - First value
 * @param {number|string|Decimal} b - Second value
 * @returns {Decimal} Sum as Decimal
 */
export function add(a, b) {
  return toDecimal(a).plus(toDecimal(b))
}

/**
 * Subtract two values using exact decimal arithmetic.
 *
 * @param {number|string|Decimal} a - Value to subtract from
 * @param {number|string|Decimal} b - Value to subtract
 * @returns {Decimal} Difference as Decimal
 */
export function subtract(a, b) {
  return toDecimal(a).minus(toDecimal(b))
}

/**
 * Multiply two values using exact decimal arithmetic.
 *
 * @param {number|string|Decimal} a - First value
 * @param {number|string|Decimal} b - Second value
 * @returns {Decimal} Product as Decimal
 */
export function multiply(a, b) {
  return toDecimal(a).times(toDecimal(b))
}

/**
 * Check if two values are exactly equal using decimal comparison.
 * Replaces floating point comparisons with tolerance thresholds.
 *
 * @param {number|string|Decimal} a - First value
 * @param {number|string|Decimal} b - Second value
 * @returns {boolean} True if values are exactly equal
 */
export function equals(a, b) {
  return toDecimal(a).equals(toDecimal(b))
}

/**
 * Get the absolute value of a number.
 *
 * @param {number|string|Decimal} value - Value to get absolute value of
 * @returns {Decimal} Absolute value as Decimal
 */
export function abs(value) {
  return toDecimal(value).abs()
}

/**
 * Check if a value is greater than another.
 *
 * @param {number|string|Decimal} a - First value
 * @param {number|string|Decimal} b - Second value
 * @returns {boolean} True if a > b
 */
export function greaterThan(a, b) {
  return toDecimal(a).greaterThan(toDecimal(b))
}

/**
 * Check if a value is zero.
 *
 * @param {number|string|Decimal} value - Value to check
 * @returns {boolean} True if value equals zero
 */
export function isZero(value) {
  return toDecimal(value).isZero()
}

/**
 * Round a value to 2 decimal places using ROUND_HALF_UP.
 * Used to detect and correct IEEE 754 floating-point drift in waste balance
 * totals – the data layer guarantees all inputs are at most 2 dp, so any value
 * with more significant decimal places is the result of accumulated rounding
 * errors and should be snapped back to 2 dp.
 *
 * @param {number|string|Decimal} value - Value to round
 * @returns {number} Value rounded to 2 decimal places
 */
export function roundTo2dp(value) {
  return toNumber(toDecimal(value).toDecimalPlaces(2))
}
