import Decimal from 'decimal.js'

/** @typedef {import('decimal.js').Decimal} DecimalInstance */
/** @typedef {import('decimal.js').Decimal.Value} DecimalValue */
/** @typedef {import('mongodb').Decimal128} BsonDecimal128 */

const DecimalConstructor =
  /** @type {import('decimal.js').Decimal.Constructor} */ (Decimal)

/**
 * Configure Decimal.js for financial calculations
 * - Precision: 34 significant digits (matches MongoDB Decimal128 spec)
 * - Rounding: ROUND_HALF_UP (standard financial rounding)
 */
const ConfiguredDecimal = DecimalConstructor.clone({
  precision: 34,
  rounding: DecimalConstructor.ROUND_HALF_UP
})

/**
 * Convert a value to a Decimal instance.
 * Handles numbers, strings, Decimal instances, null, and undefined.
 *
 * @param {DecimalValue|null|undefined} value - Value to convert
 * @returns {DecimalInstance} Decimal instance (0 for null/undefined)
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
 * @param {DecimalValue|BsonDecimal128|null|undefined} value - Value to convert
 * @returns {number} JavaScript number
 */
export function toNumber(value) {
  if (value === null || value === undefined) {
    return 0
  }
  if (
    typeof value === 'object' &&
    '_bsontype' in value &&
    value._bsontype === 'Decimal128'
  ) {
    return Number(value.toString())
  }
  if (value instanceof DecimalConstructor) {
    return value.toNumber()
  }
  return Number(value)
}

/**
 * Round a value to two decimal places using half-up rounding.
 *
 * @param {DecimalValue|null|undefined} value - Value to round
 * @returns {number} JavaScript number rounded to 2 decimal places
 */
export function roundToTwoDecimalPlaces(value) {
  return toDecimal(value).toDecimalPlaces(2).toNumber()
}

/**
 * Add two values using exact decimal arithmetic.
 *
 * @param {DecimalValue} a - First value
 * @param {DecimalValue} b - Second value
 * @returns {DecimalInstance} Sum as Decimal
 */
export function add(a, b) {
  return toDecimal(a).plus(toDecimal(b))
}

/**
 * Add `value` to a running accumulator, rounding `value` to `decimalPlaces`
 * first (round-each-then-sum). Only `value` is rounded - `acc` is the
 * already-rounded running total and is left untouched. Returns a Decimal so it
 * composes in reduce/loop accumulations.
 *
 * @param {DecimalValue} acc - Running total (already rounded)
 * @param {DecimalValue|null|undefined} value - Per-row value to round then add (null/undefined treated as zero)
 * @param {number} decimalPlaces - Decimal places to round `value` to
 * @returns {DecimalInstance} Sum as Decimal
 */
export function addRounded(acc, value, decimalPlaces) {
  return add(acc, toDecimal(value).toDecimalPlaces(decimalPlaces))
}

/**
 * Subtract two values using exact decimal arithmetic.
 *
 * @param {DecimalValue} a - Value to subtract from
 * @param {DecimalValue} b - Value to subtract
 * @returns {DecimalInstance} Difference as Decimal
 */
export function subtract(a, b) {
  return toDecimal(a).minus(toDecimal(b))
}

/**
 * Check if two values are exactly equal using decimal comparison.
 * Replaces floating point comparisons with tolerance thresholds.
 *
 * @param {DecimalValue} a - First value
 * @param {DecimalValue} b - Second value
 * @returns {boolean} True if values are exactly equal
 */
export function equals(a, b) {
  return toDecimal(a).equals(toDecimal(b))
}

/**
 * Get the absolute value of a number.
 *
 * @param {DecimalValue} value - Value to get absolute value of
 * @returns {DecimalInstance} Absolute value as Decimal
 */
export function abs(value) {
  return toDecimal(value).abs()
}

/**
 * Check if a value is greater than another.
 *
 * @param {DecimalValue} a - First value
 * @param {DecimalValue} b - Second value
 * @returns {boolean} True if a > b
 */
export function greaterThan(a, b) {
  return toDecimal(a).greaterThan(toDecimal(b))
}

/**
 * Check if a value is zero.
 *
 * @param {DecimalValue} value - Value to check
 * @returns {boolean} True if value equals zero
 */
export function isZero(value) {
  return toDecimal(value).isZero()
}
