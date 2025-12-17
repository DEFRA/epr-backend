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

/**
 * Creates a weight fields extractor for a given set of column headers.
 *
 * @param {Object} fields - Column header mapping
 * @param {string} fields.GROSS_WEIGHT - Column header for gross weight
 * @param {string} fields.TARE_WEIGHT - Column header for tare weight
 * @param {string} fields.PALLET_WEIGHT - Column header for pallet weight
 * @param {string} fields.NET_WEIGHT - Column header for net weight
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
    return {
      grossWeight: value[fields.GROSS_WEIGHT],
      tareWeight: value[fields.TARE_WEIGHT],
      palletWeight: value[fields.PALLET_WEIGHT],
      netWeight: value[fields.NET_WEIGHT]
    }
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

    const { grossWeight, tareWeight, palletWeight, netWeight } = weightFields
    const expected = grossWeight - tareWeight - palletWeight

    if (!areNumbersEqual(netWeight, expected)) {
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
