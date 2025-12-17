import Joi from 'joi'
import { areNumbersEqual } from '../number-validation.js'
import { createWeightFieldSchema } from '../field-schemas.js'

/**
 * A validated row containing weight fields.
 * Used as a type guard target - after extraction,
 * these fields are guaranteed to have the correct types.
 * @typedef {Object} WeightFields
 * @property {number} GROSS_WEIGHT
 * @property {number} TARE_WEIGHT
 * @property {number} PALLET_WEIGHT
 * @property {number} NET_WEIGHT
 */

/**
 * Creates a weight fields extractor for a given set of field names.
 *
 * Returns a function that extracts and validates weight fields from a row.
 * The extractor returns a strongly-typed object containing only the weight
 * fields if all fields are present and valid, or null otherwise.
 *
 * @param {Object} fields - Field name constants object
 * @param {string} fields.GROSS_WEIGHT - Name of the gross weight field
 * @param {string} fields.TARE_WEIGHT - Name of the tare weight field
 * @param {string} fields.PALLET_WEIGHT - Name of the pallet weight field
 * @param {string} fields.NET_WEIGHT - Name of the net weight field
 * @returns {(row: Record<string, unknown>) => WeightFields | null} Extractor function
 */
export const createWeightFieldsExtractor = (fields) => {
  const weightFieldsSchema = Joi.object({
    [fields.GROSS_WEIGHT]: createWeightFieldSchema().required(),
    [fields.TARE_WEIGHT]: createWeightFieldSchema().required(),
    [fields.PALLET_WEIGHT]: createWeightFieldSchema().required(),
    [fields.NET_WEIGHT]: createWeightFieldSchema().required()
  })

  return (row) => {
    const { error, value } = weightFieldsSchema.validate(row, {
      stripUnknown: true,
      abortEarly: true
    })
    if (error) {
      return null
    }
    return value
  }
}

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
 * It only validates when all four fields are present and valid.
 *
 * Uses the extractor to get strongly-typed fields, ensuring both
 * presence and type correctness before performing calculations.
 *
 * @param {Object} fields - Field name constants object with GROSS_WEIGHT, TARE_WEIGHT, PALLET_WEIGHT, NET_WEIGHT
 * @returns {import('joi').CustomValidator<Record<string, unknown>>} Joi custom validator function
 */
export const createNetWeightValidator = (fields) => {
  const extractWeightFields = createWeightFieldsExtractor(fields)

  return (value, helpers) => {
    const weightFields = extractWeightFields(value)
    if (!weightFields) {
      // Fields not present or invalid - skip validation
      return value
    }

    const gross = weightFields[fields.GROSS_WEIGHT]
    const tare = weightFields[fields.TARE_WEIGHT]
    const pallet = weightFields[fields.PALLET_WEIGHT]
    const net = weightFields[fields.NET_WEIGHT]

    const expected = gross - tare - pallet

    if (!areNumbersEqual(net, expected)) {
      return helpers.error('custom.netWeightCalculationMismatch', {
        field: fields.NET_WEIGHT
      })
    }

    return value
  }
}

/**
 * Joi messages for the NET_WEIGHT validator
 */
export const NET_WEIGHT_MESSAGES = Object.freeze({
  'custom.netWeightCalculationMismatch': MUST_EQUAL_NET_WEIGHT_CALCULATION
})
