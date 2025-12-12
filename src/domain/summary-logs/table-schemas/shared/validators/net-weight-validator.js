import { areNumbersEqual } from '../number-validation.js'

/**
 * Error message for NET_WEIGHT calculation mismatch
 */
const MUST_EQUAL_NET_WEIGHT_CALCULATION =
  'must equal GROSS_WEIGHT − TARE_WEIGHT − PALLET_WEIGHT'

/**
 * Creates a NET_WEIGHT validator for a given set of field names
 *
 * The returned validator checks that NET_WEIGHT equals
 * GROSS_WEIGHT - TARE_WEIGHT - PALLET_WEIGHT.
 *
 * This is a Joi custom validator for use at the object level.
 * It only validates when all four fields are present (filled).
 *
 * Note: By the time this validator runs, unfilled values (null, undefined, '')
 * have already been filtered out by the validation pipeline. So we check
 * for field presence using the `in` operator.
 *
 * @param {Object} fields - Field name constants object with GROSS_WEIGHT, TARE_WEIGHT, PALLET_WEIGHT, NET_WEIGHT
 * @returns {function} Joi custom validator function
 */
export const createNetWeightValidator = (fields) => (value, helpers) => {
  const hasAllFields =
    fields.GROSS_WEIGHT in value &&
    fields.TARE_WEIGHT in value &&
    fields.PALLET_WEIGHT in value &&
    fields.NET_WEIGHT in value

  if (!hasAllFields) {
    return value
  }

  const gross = value[fields.GROSS_WEIGHT]
  const tare = value[fields.TARE_WEIGHT]
  const pallet = value[fields.PALLET_WEIGHT]
  const net = value[fields.NET_WEIGHT]

  const expected = gross - tare - pallet

  if (!areNumbersEqual(net, expected)) {
    return helpers.error('custom.netWeightCalculationMismatch', {
      field: fields.NET_WEIGHT
    })
  }

  return value
}

/**
 * Joi messages for the NET_WEIGHT validator
 */
export const NET_WEIGHT_MESSAGES = Object.freeze({
  'custom.netWeightCalculationMismatch': MUST_EQUAL_NET_WEIGHT_CALCULATION
})
