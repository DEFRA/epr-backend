import { areNumbersEqual } from '../../shared/index.js'
import { RECEIVED_LOADS_FIELDS } from '../fields.js'

/**
 * Error message for NET_WEIGHT calculation mismatch
 *
 * Defined locally as this message is specific to this validator.
 */
const MUST_EQUAL_NET_WEIGHT_CALCULATION =
  'must equal GROSS_WEIGHT − TARE_WEIGHT − PALLET_WEIGHT'

/**
 * Validates that NET_WEIGHT equals GROSS_WEIGHT - TARE_WEIGHT - PALLET_WEIGHT
 *
 * This is a Joi custom validator for use at the object level.
 * It only validates when all four fields are present (filled).
 *
 * Note: By the time this validator runs, unfilled values (null, undefined, '')
 * have already been filtered out by the validation pipeline. So we check
 * for field presence using the `in` operator.
 *
 * @param {Object} value - The row object being validated
 * @param {Object} helpers - Joi validation helpers
 * @returns {Object} The value if valid, or helpers.error() if invalid
 */
export const validateNetWeight = (value, helpers) => {
  const hasAllFields =
    RECEIVED_LOADS_FIELDS.GROSS_WEIGHT in value &&
    RECEIVED_LOADS_FIELDS.TARE_WEIGHT in value &&
    RECEIVED_LOADS_FIELDS.PALLET_WEIGHT in value &&
    RECEIVED_LOADS_FIELDS.NET_WEIGHT in value

  if (!hasAllFields) {
    return value
  }

  const gross = value[RECEIVED_LOADS_FIELDS.GROSS_WEIGHT]
  const tare = value[RECEIVED_LOADS_FIELDS.TARE_WEIGHT]
  const pallet = value[RECEIVED_LOADS_FIELDS.PALLET_WEIGHT]
  const net = value[RECEIVED_LOADS_FIELDS.NET_WEIGHT]

  const expected = gross - tare - pallet

  if (!areNumbersEqual(net, expected)) {
    return helpers.error('custom.calculationMismatch', {
      field: RECEIVED_LOADS_FIELDS.NET_WEIGHT
    })
  }

  return value
}

/**
 * Joi messages for the NET_WEIGHT validator
 */
export const NET_WEIGHT_MESSAGES = Object.freeze({
  'custom.calculationMismatch': MUST_EQUAL_NET_WEIGHT_CALCULATION
})
