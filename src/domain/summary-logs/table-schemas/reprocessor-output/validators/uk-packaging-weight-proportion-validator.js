import { isProductCorrect } from '../../shared/index.js'
import { REPROCESSED_LOADS_FIELDS } from '../fields.js'

/**
 * Error message for UK packaging weight proportion calculation mismatch
 *
 * Defined locally as this message is specific to this validator.
 */
const MUST_MATCH_CALCULATION =
  'must equal PRODUCT_TONNAGE × UK_PACKAGING_WEIGHT_PERCENTAGE'

/**
 * Validates that PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION equals
 * PRODUCT_TONNAGE × UK_PACKAGING_WEIGHT_PERCENTAGE
 *
 * This is a Joi custom validator for use at the object level.
 * It only validates when all three fields are present (filled).
 *
 * Note: By the time this validator runs, unfilled values (null, undefined, '')
 * have already been filtered out by the validation pipeline. So we check
 * for field presence using the `in` operator.
 *
 * @param {Object} value - The row object being validated
 * @param {Object} helpers - Joi validation helpers
 * @returns {Object} The value if valid, or helpers.error() if invalid
 */
export const validateUkPackagingWeightProportion = (value, helpers) => {
  const hasAllFields =
    REPROCESSED_LOADS_FIELDS.PRODUCT_TONNAGE in value &&
    REPROCESSED_LOADS_FIELDS.UK_PACKAGING_WEIGHT_PERCENTAGE in value &&
    REPROCESSED_LOADS_FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION in value

  if (!hasAllFields) {
    return value
  }

  const tonnage = value[REPROCESSED_LOADS_FIELDS.PRODUCT_TONNAGE]
  const percentage =
    value[REPROCESSED_LOADS_FIELDS.UK_PACKAGING_WEIGHT_PERCENTAGE]
  const proportion =
    value[REPROCESSED_LOADS_FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION]

  if (!isProductCorrect(proportion, tonnage, percentage)) {
    return helpers.error('custom.ukPackagingProportionCalculationMismatch', {
      field: REPROCESSED_LOADS_FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION
    })
  }

  return value
}

/**
 * Joi messages for the UK packaging weight proportion validator
 */
export const UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES = Object.freeze({
  'custom.ukPackagingProportionCalculationMismatch': MUST_MATCH_CALCULATION
})
