import Joi from 'joi'

import { add, roundToTwoDecimalPlaces, toDecimal } from './decimal-utils.js'

/**
 * A tonnage held to two decimal places, carried as an exact Decimal. The
 * summary-log row-state collection stores every tonnage pre-rounded
 * (ROUND_HALF_UP), so a value pulled from stored row data is a `RoundedTonnage`
 * and can be summed exactly without any rounding of its own. Two-decimal-place
 * values are closed under addition, so a sum of `RoundedTonnage`s is itself a
 * `RoundedTonnage` — the brand rides through the arithmetic. It keeps a
 * full-precision figure — anything a plain number could hold — from being
 * treated as one; construct a `RoundedTonnage` only through
 * {@link toRoundedTonnage} or {@link addTonnage}.
 *
 * @typedef {import('decimal.js').Decimal & { readonly __brand: 'RoundedTonnage' }} RoundedTonnage
 */

/**
 * A finite number already held to two decimal places. Values carrying more
 * precision are rejected rather than silently rounded, so a stored value that
 * was not coerced at the write boundary surfaces as an error instead of
 * skewing a total.
 */
export const roundedTonnageSchema = Joi.number().custom((value, helpers) =>
  roundToTwoDecimalPlaces(value) === value
    ? value
    : helpers.error('any.invalid')
)

/**
 * Interpret a value pulled from stored row data as a `RoundedTonnage`. An
 * absent field reads as zero, matching how a missing tonnage has always summed;
 * any present value must already be at two decimal places.
 *
 * @param {unknown} value
 * @returns {RoundedTonnage}
 */
export const toRoundedTonnage = (value) => {
  const candidate = value ?? 0
  const { error, value: validated } = roundedTonnageSchema.validate(candidate, {
    convert: false
  })
  if (error) {
    throw new Error(
      `Value is not a tonnage held to two decimal places: ${JSON.stringify(value)}`
    )
  }
  return /** @type {RoundedTonnage} */ (toDecimal(validated))
}

/** A zero `RoundedTonnage`, for seeding running totals. */
export const ZERO_TONNAGE = toRoundedTonnage(0)

/**
 * Add two rounded tonnages, yielding a rounded tonnage. Two-decimal-place
 * values are closed under addition, so the sum needs no re-rounding to hold the
 * invariant.
 *
 * @param {RoundedTonnage} a
 * @param {RoundedTonnage} b
 * @returns {RoundedTonnage}
 */
export const addTonnage = (a, b) => /** @type {RoundedTonnage} */ (add(a, b))
