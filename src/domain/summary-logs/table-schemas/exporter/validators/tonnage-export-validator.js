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
 * Extracted tonnage export fields.
 * @typedef {Object} TonnageExportFields
 * @property {number} netWeight
 * @property {number} weightOfNonTargetMaterials
 * @property {boolean} bailingWireProtocol
 * @property {number} recyclableProportionPercentage
 * @property {number} tonnageReceivedForExport
 */

/**
 * Joi schema for extracting and validating tonnage export fields.
 *
 * Uses the same field schema factories as the main table schema,
 * but makes fields required for extraction.
 * Does not allow unknown fields - stripUnknown at validation time
 * returns only these fields.
 */
const tonnageExportFieldsSchema = Joi.object({
  [RECEIVED_LOADS_FIELDS.NET_WEIGHT]: createWeightFieldSchema().required(),
  [RECEIVED_LOADS_FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS]:
    createWeightFieldSchema().required(),
  [RECEIVED_LOADS_FIELDS.BAILING_WIRE_PROTOCOL]:
    createYesNoFieldSchema().required(),
  [RECEIVED_LOADS_FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE]:
    createPercentageFieldSchema().required(),
  [RECEIVED_LOADS_FIELDS.TONNAGE_RECEIVED_FOR_EXPORT]:
    createNumberFieldSchema().required()
})

/**
 * Extracts and validates tonnage export fields from a row.
 *
 * @param {Record<string, unknown>} row - Row data to extract from
 * @returns {TonnageExportFields | null} Extracted fields or null if invalid
 */
export const extractTonnageExportFields = (row) => {
  const { error, value } = tonnageExportFieldsSchema.validate(row, {
    stripUnknown: true,
    abortEarly: true
  })
  if (error) {
    return null
  }
  return {
    netWeight: value[RECEIVED_LOADS_FIELDS.NET_WEIGHT],
    weightOfNonTargetMaterials:
      value[RECEIVED_LOADS_FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS],
    bailingWireProtocol:
      value[RECEIVED_LOADS_FIELDS.BAILING_WIRE_PROTOCOL] === YES_NO_VALUES.YES,
    recyclableProportionPercentage:
      value[RECEIVED_LOADS_FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE],
    tonnageReceivedForExport:
      value[RECEIVED_LOADS_FIELDS.TONNAGE_RECEIVED_FOR_EXPORT]
  }
}

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
 * It only validates when all required fields are present and valid.
 *
 * Uses the extractor to get strongly-typed fields, ensuring both
 * presence and type correctness before performing calculations.
 *
 * @type {import('joi').CustomValidator<Record<string, unknown>>}
 */
export const validateTonnageExport = (value, helpers) => {
  const tonnageFields = extractTonnageExportFields(value)
  if (!tonnageFields) {
    // Fields not present or invalid - skip validation
    return value
  }

  const {
    netWeight,
    weightOfNonTargetMaterials,
    bailingWireProtocol,
    recyclableProportionPercentage,
    tonnageReceivedForExport
  } = tonnageFields

  // Calculate base weight (adjusted weight before recyclable proportion)
  const baseWeight = netWeight - weightOfNonTargetMaterials

  // Apply bailing wire deduction if protocol is true
  const adjustedWeight = bailingWireProtocol
    ? baseWeight * BAILING_WIRE_FACTOR
    : baseWeight

  // Calculate expected tonnage
  const expectedTonnage = adjustedWeight * recyclableProportionPercentage

  if (!areNumbersEqual(tonnageReceivedForExport, expectedTonnage)) {
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
