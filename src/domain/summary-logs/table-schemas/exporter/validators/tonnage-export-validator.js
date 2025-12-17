import { areNumbersEqual, YES_NO_VALUES } from '../../shared/index.js'
import { RECEIVED_LOADS_FIELDS } from '../fields.js'

/**
 * A validated row containing tonnage export fields.
 * Used as a type guard target - after checking field presence,
 * these fields are guaranteed to have the correct types.
 * @typedef {Object} ValidatedTonnageExportRow
 * @property {number} NET_WEIGHT
 * @property {number} WEIGHT_OF_NON_TARGET_MATERIALS
 * @property {string} BAILING_WIRE_PROTOCOL
 * @property {number} RECYCLABLE_PROPORTION_PERCENTAGE
 * @property {number} TONNAGE_RECEIVED_FOR_EXPORT
 */

/**
 * Bailing wire deduction factor
 *
 * When BAILING_WIRE_PROTOCOL is "Yes", 0.15% (0.0015) is deducted from
 * the base weight. This is equivalent to multiplying by 0.9985.
 */
const BAILING_WIRE_FACTOR = 0.9985

/**
 * Error message for TONNAGE_RECEIVED_FOR_EXPORT calculation mismatch
 *
 * Defined locally as this message is specific to this validator.
 */
const MUST_EQUAL_TONNAGE_CALCULATION =
  'must equal the calculated tonnage based on NET_WEIGHT, WEIGHT_OF_NON_TARGET_MATERIALS, BAILING_WIRE_PROTOCOL, and RECYCLABLE_PROPORTION_PERCENTAGE'

/**
 * Checks if all tonnage export fields are present in the row.
 * Acts as a type guard to narrow the row type.
 * @param {Record<string, unknown>} value - Row to check
 * @returns {value is ValidatedTonnageExportRow} True if all fields are present
 */
const hasAllTonnageExportFields = (value) =>
  RECEIVED_LOADS_FIELDS.NET_WEIGHT in value &&
  RECEIVED_LOADS_FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS in value &&
  RECEIVED_LOADS_FIELDS.BAILING_WIRE_PROTOCOL in value &&
  RECEIVED_LOADS_FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE in value &&
  RECEIVED_LOADS_FIELDS.TONNAGE_RECEIVED_FOR_EXPORT in value

/**
 * Validates that TONNAGE_RECEIVED_FOR_EXPORT matches the expected formula
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
 * @type {import('joi').CustomValidator<Record<string, unknown>>}
 */
export const validateTonnageExport = (value, helpers) => {
  if (!hasAllTonnageExportFields(value)) {
    return value
  }

  const {
    NET_WEIGHT: netWeight,
    WEIGHT_OF_NON_TARGET_MATERIALS: nonTargetMaterials,
    BAILING_WIRE_PROTOCOL: bailingWireProtocol,
    RECYCLABLE_PROPORTION_PERCENTAGE: recyclableProportion,
    TONNAGE_RECEIVED_FOR_EXPORT: actualTonnage
  } = value

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
    return helpers.error('custom.tonnageCalculationMismatch', {
      field: RECEIVED_LOADS_FIELDS.TONNAGE_RECEIVED_FOR_EXPORT
    })
  }

  return value
}

/**
 * Joi messages for the TONNAGE_RECEIVED_FOR_EXPORT validator
 */
export const TONNAGE_EXPORT_MESSAGES = Object.freeze({
  'custom.tonnageCalculationMismatch': MUST_EQUAL_TONNAGE_CALCULATION
})
