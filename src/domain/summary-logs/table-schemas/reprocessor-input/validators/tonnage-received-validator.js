import Joi from 'joi'
import {
  areNumbersEqual,
  YES_NO_VALUES,
  createWeightFieldSchema,
  createYesNoFieldSchema,
  createPercentageFieldSchema,
  createNumberFieldSchema
} from '../../shared/index.js'
import { RECEIVED_LOADS_FIELDS } from '../fields.js'

/**
 * A validated row containing tonnage reprocessing fields.
 * Used as a type guard target - after extraction,
 * these fields are guaranteed to have the correct types.
 * @typedef {Object} TonnageReceivedFields
 * @property {number} NET_WEIGHT
 * @property {number} WEIGHT_OF_NON_TARGET_MATERIALS
 * @property {string} BAILING_WIRE_PROTOCOL
 * @property {number} RECYCLABLE_PROPORTION_PERCENTAGE
 * @property {number} TONNAGE_RECEIVED_FOR_RECYCLING
 */

/**
 * Joi schema for extracting and validating tonnage received fields.
 *
 * Uses the same field schema factories as the main table schema,
 * but makes fields required for extraction.
 * Does not allow unknown fields - stripUnknown at validation time
 * returns only these fields.
 */
const tonnageReceivedFieldsSchema = Joi.object({
  [RECEIVED_LOADS_FIELDS.NET_WEIGHT]: createWeightFieldSchema().required(),
  [RECEIVED_LOADS_FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS]:
    createWeightFieldSchema().required(),
  [RECEIVED_LOADS_FIELDS.BAILING_WIRE_PROTOCOL]:
    createYesNoFieldSchema().required(),
  [RECEIVED_LOADS_FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE]:
    createPercentageFieldSchema().required(),
  [RECEIVED_LOADS_FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING]:
    createNumberFieldSchema().required()
})

/**
 * Extracts and validates tonnage received fields from a row.
 *
 * Returns a strongly-typed object containing only the tonnage fields
 * if all fields are present and valid. Returns null if any field is
 * missing or fails validation.
 *
 * @param {Record<string, unknown>} row - Row data to extract from
 * @returns {TonnageReceivedFields | null} Extracted fields or null
 */
export const extractTonnageReceivedFields = (row) => {
  const { error, value } = tonnageReceivedFieldsSchema.validate(row, {
    stripUnknown: true,
    abortEarly: true
  })
  if (error) {
    return null
  }
  return value
}

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
 * It only validates when all required fields are present and valid.
 *
 * Uses the extractor to get strongly-typed fields, ensuring both
 * presence and type correctness before performing calculations.
 *
 * @type {import('joi').CustomValidator<Record<string, unknown>>}
 */
export const validateTonnageReceived = (value, helpers) => {
  const tonnageFields = extractTonnageReceivedFields(value)
  if (!tonnageFields) {
    // Fields not present or invalid - skip validation
    return value
  }

  const {
    NET_WEIGHT: netWeight,
    WEIGHT_OF_NON_TARGET_MATERIALS: nonTargetMaterials,
    BAILING_WIRE_PROTOCOL: bailingWireProtocol,
    RECYCLABLE_PROPORTION_PERCENTAGE: recyclableProportion,
    TONNAGE_RECEIVED_FOR_RECYCLING: actualTonnage
  } = tonnageFields

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
      field: RECEIVED_LOADS_FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING
    })
  }

  return value
}

/**
 * Joi messages for the TONNAGE_RECEIVED_FOR_RECYCLING validator
 */
export const TONNAGE_RECEIVED_MESSAGES = Object.freeze({
  'custom.tonnageCalculationMismatch': MUST_EQUAL_TONNAGE_CALCULATION
})
