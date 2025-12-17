import Joi from 'joi'
import { areNumbersEqual } from '../number-validation.js'
import { createWeightFieldSchema } from '../field-schemas.js'

/**
 * Extracted weight fields.
 * @typedef {Object} WeightFields
 * @property {number} grossWeight
 * @property {number} tareWeight
 * @property {number} palletWeight
 * @property {number} netWeight
 */

const weightFieldsSchema = Joi.object({
  GROSS_WEIGHT: createWeightFieldSchema().required(),
  TARE_WEIGHT: createWeightFieldSchema().required(),
  PALLET_WEIGHT: createWeightFieldSchema().required(),
  NET_WEIGHT: createWeightFieldSchema().required()
})

/**
 * Extracts and validates weight fields from a row.
 *
 * @param {Record<string, unknown>} row - Row data to extract from
 * @returns {WeightFields | null} Extracted fields or null if invalid
 */
export const extractWeightFields = (row) => {
  const { error, value } = weightFieldsSchema.validate(row, {
    stripUnknown: true,
    abortEarly: true
  })
  if (error) {
    return null
  }
  return {
    grossWeight: value.GROSS_WEIGHT,
    tareWeight: value.TARE_WEIGHT,
    palletWeight: value.PALLET_WEIGHT,
    netWeight: value.NET_WEIGHT
  }
}

/**
 * Error message for NET_WEIGHT calculation mismatch
 */
const MUST_EQUAL_NET_WEIGHT_CALCULATION =
  'must equal GROSS_WEIGHT − TARE_WEIGHT − PALLET_WEIGHT'

/**
 * Validates that NET_WEIGHT equals GROSS_WEIGHT - TARE_WEIGHT - PALLET_WEIGHT.
 *
 * This is a Joi custom validator for use at the object level.
 * It only validates when all four fields are present and valid.
 *
 * @type {import('joi').CustomValidator<Record<string, unknown>>}
 */
export const validateNetWeight = (value, helpers) => {
  const weightFields = extractWeightFields(value)
  if (!weightFields) {
    // Fields not present or invalid - skip validation
    return value
  }

  const { grossWeight, tareWeight, palletWeight, netWeight } = weightFields
  const expected = grossWeight - tareWeight - palletWeight

  if (!areNumbersEqual(netWeight, expected)) {
    return helpers.error('custom.netWeightCalculationMismatch', {
      field: 'NET_WEIGHT'
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
