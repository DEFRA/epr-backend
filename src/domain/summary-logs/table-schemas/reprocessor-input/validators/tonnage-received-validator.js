import { areNumbersEqual, YES_NO_VALUES } from '../../shared/index.js'
import { RECEIVED_LOADS_FIELDS } from '../fields.js'

/**
 * Bailing wire deduction factor
 *
 * When BAILING_WIRE_PROTOCOL is "Yes", 0.15% (0.0015) is deducted from
 * the base weight. This is equivalent to multiplying by 0.9985.
 */
const BAILING_WIRE_FACTOR = 0.9985

/**
 * Error message for TONNAGE_RECEIVED_FOR_RECYCLING calculation mismatch
 *
 * Defined locally as this message is specific to this validator.
 */
const MUST_EQUAL_TONNAGE_CALCULATION =
  'must equal the calculated tonnage based on NET_WEIGHT, WEIGHT_OF_NON_TARGET_MATERIALS, BAILING_WIRE_PROTOCOL, and RECYCLABLE_PROPORTION_PERCENTAGE'

/**
 * Validates that TONNAGE_RECEIVED_FOR_RECYCLING matches the expected formula
 *
 * Formula:
 * - If BAILING_WIRE_PROTOCOL = "Yes":
 *   TONNAGE = (NET_WEIGHT - WEIGHT_OF_NON_TARGET_MATERIALS) × 0.9985 × RECYCLABLE_PROPORTION_PERCENTAGE
 * - Otherwise:
 *   TONNAGE = (NET_WEIGHT - WEIGHT_OF_NON_TARGET_MATERIALS) × RECYCLABLE_PROPORTION_PERCENTAGE
 *
 * The 0.9985 factor represents a 0.15% bailing wire deduction.
 *
 * This is a Joi custom validator for use at the object level.
 * It only validates when all required fields are present (filled).
 *
 * Note: By the time this validator runs, unfilled values (null, undefined, '')
 * have already been filtered out by the validation pipeline. So we check
 * for field presence using the `in` operator.
 *
 * @param {Object} value - The row object being validated
 * @param {Object} helpers - Joi validation helpers
 * @returns {Object} The value if valid, or helpers.error() if invalid
 */
export const validateTonnageReceived = (value, helpers) => {
  const hasAllFields =
    RECEIVED_LOADS_FIELDS.NET_WEIGHT in value &&
    RECEIVED_LOADS_FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS in value &&
    RECEIVED_LOADS_FIELDS.BAILING_WIRE_PROTOCOL in value &&
    RECEIVED_LOADS_FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE in value &&
    RECEIVED_LOADS_FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING in value

  if (!hasAllFields) {
    return value
  }

  const netWeight = value[RECEIVED_LOADS_FIELDS.NET_WEIGHT]
  const nonTargetMaterials =
    value[RECEIVED_LOADS_FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS]
  const bailingWireProtocol = value[RECEIVED_LOADS_FIELDS.BAILING_WIRE_PROTOCOL]
  const recyclableProportion =
    value[RECEIVED_LOADS_FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE]
  const actualTonnage =
    value[RECEIVED_LOADS_FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING]

  // Calculate base weight (adjusted weight before recyclable proportion)
  const baseWeight = netWeight - nonTargetMaterials

  // Apply bailing wire deduction if protocol is "Yes"
  const adjustedWeight =
    bailingWireProtocol === YES_NO_VALUES.YES
      ? baseWeight * BAILING_WIRE_FACTOR
      : baseWeight

  // Calculate expected tonnage
  const expectedTonnage = adjustedWeight * recyclableProportion

  if (!areNumbersEqual(actualTonnage, expectedTonnage)) {
    return helpers.error('custom.calculationMismatch', {
      field: RECEIVED_LOADS_FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING
    })
  }

  return value
}

/**
 * Joi messages for the TONNAGE_RECEIVED_FOR_RECYCLING validator
 */
export const TONNAGE_RECEIVED_MESSAGES = Object.freeze({
  'custom.calculationMismatch': MUST_EQUAL_TONNAGE_CALCULATION
})
