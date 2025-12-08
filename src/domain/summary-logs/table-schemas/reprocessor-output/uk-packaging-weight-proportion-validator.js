import { isProductCorrect, MESSAGES } from '../shared/index.js'

/**
 * Field names for the UK packaging weight proportion calculation
 */
const FIELDS = Object.freeze({
  PRODUCT_TONNAGE: 'PRODUCT_TONNAGE',
  UK_PACKAGING_WEIGHT_PERCENTAGE: 'UK_PACKAGING_WEIGHT_PERCENTAGE',
  PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION:
    'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION'
})

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
    FIELDS.PRODUCT_TONNAGE in value &&
    FIELDS.UK_PACKAGING_WEIGHT_PERCENTAGE in value &&
    FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION in value

  if (!hasAllFields) {
    return value
  }

  const tonnage = value[FIELDS.PRODUCT_TONNAGE]
  const percentage = value[FIELDS.UK_PACKAGING_WEIGHT_PERCENTAGE]
  const proportion = value[FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION]

  if (!isProductCorrect(proportion, tonnage, percentage)) {
    return helpers.error('custom.calculationMismatch', {
      field: FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION
    })
  }

  return value
}

/**
 * Joi messages for the UK packaging weight proportion validator
 */
export const UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES = Object.freeze({
  'custom.calculationMismatch': MESSAGES.MUST_MATCH_CALCULATION
})
