import { describe, expect, it } from 'vitest'
import Joi from 'joi'
import {
  createNetWeightValidator,
  createWeightFieldsExtractor,
  NET_WEIGHT_MESSAGES
} from './net-weight-validator.js'

// Define test field names
const FIELDS = {
  GROSS_WEIGHT: 'GROSS_WEIGHT',
  TARE_WEIGHT: 'TARE_WEIGHT',
  PALLET_WEIGHT: 'PALLET_WEIGHT',
  NET_WEIGHT: 'NET_WEIGHT'
}

describe('createWeightFieldsExtractor', () => {
  const extractWeightFields = createWeightFieldsExtractor(FIELDS)

  describe('when all fields are present and valid', () => {
    it('returns strongly-typed object with only weight fields', () => {
      const row = {
        ROW_ID: 1001,
        GROSS_WEIGHT: 100,
        TARE_WEIGHT: 20,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 75,
        OTHER_FIELD: 'ignored'
      }

      const result = extractWeightFields(row)

      expect(result).toEqual({
        grossWeight: 100,
        tareWeight: 20,
        palletWeight: 5,
        netWeight: 75
      })
    })

    it('strips unknown fields from the result', () => {
      const row = {
        GROSS_WEIGHT: 50,
        TARE_WEIGHT: 10,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 35,
        EXTRA_FIELD_1: 'should not appear',
        EXTRA_FIELD_2: 12345
      }

      const result = extractWeightFields(row)

      expect(Object.keys(result)).toEqual([
        'grossWeight',
        'tareWeight',
        'palletWeight',
        'netWeight'
      ])
    })
  })

  describe('when fields are missing', () => {
    it('returns null when GROSS_WEIGHT is missing', () => {
      const row = {
        TARE_WEIGHT: 20,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 75
      }

      expect(extractWeightFields(row)).toBeNull()
    })

    it('returns null when TARE_WEIGHT is missing', () => {
      const row = {
        GROSS_WEIGHT: 100,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 75
      }

      expect(extractWeightFields(row)).toBeNull()
    })

    it('returns null when PALLET_WEIGHT is missing', () => {
      const row = {
        GROSS_WEIGHT: 100,
        TARE_WEIGHT: 20,
        NET_WEIGHT: 75
      }

      expect(extractWeightFields(row)).toBeNull()
    })

    it('returns null when NET_WEIGHT is missing', () => {
      const row = {
        GROSS_WEIGHT: 100,
        TARE_WEIGHT: 20,
        PALLET_WEIGHT: 5
      }

      expect(extractWeightFields(row)).toBeNull()
    })

    it('returns null when row is empty', () => {
      expect(extractWeightFields({})).toBeNull()
    })
  })

  describe('when fields have invalid types', () => {
    it('returns null when GROSS_WEIGHT is not a number', () => {
      const row = {
        GROSS_WEIGHT: 'not a number',
        TARE_WEIGHT: 20,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 75
      }

      expect(extractWeightFields(row)).toBeNull()
    })

    it('returns null when GROSS_WEIGHT is negative', () => {
      const row = {
        GROSS_WEIGHT: -100,
        TARE_WEIGHT: 20,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 75
      }

      expect(extractWeightFields(row)).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('accepts zero values', () => {
      const row = {
        GROSS_WEIGHT: 0,
        TARE_WEIGHT: 0,
        PALLET_WEIGHT: 0,
        NET_WEIGHT: 0
      }

      const result = extractWeightFields(row)

      expect(result).toEqual({
        grossWeight: 0,
        tareWeight: 0,
        palletWeight: 0,
        netWeight: 0
      })
    })

    it('accepts decimal values', () => {
      const row = {
        GROSS_WEIGHT: 100.5,
        TARE_WEIGHT: 20.25,
        PALLET_WEIGHT: 5.1,
        NET_WEIGHT: 75.15
      }

      const result = extractWeightFields(row)

      expect(result).toEqual({
        grossWeight: 100.5,
        tareWeight: 20.25,
        palletWeight: 5.1,
        netWeight: 75.15
      })
    })
  })

  describe('with different field names', () => {
    it('returns camelCase output regardless of input field names', () => {
      const customFields = {
        GROSS_WEIGHT: 'MY_GROSS',
        TARE_WEIGHT: 'MY_TARE',
        PALLET_WEIGHT: 'MY_PALLET',
        NET_WEIGHT: 'MY_NET'
      }
      const extractCustom = createWeightFieldsExtractor(customFields)

      const row = {
        MY_GROSS: 100,
        MY_TARE: 20,
        MY_PALLET: 5,
        MY_NET: 75
      }

      const result = extractCustom(row)

      // Output always has consistent camelCase keys
      expect(result).toEqual({
        grossWeight: 100,
        tareWeight: 20,
        palletWeight: 5,
        netWeight: 75
      })
    })
  })
})

describe('createNetWeightValidator', () => {
  // Create validator using factory (uses FIELDS from outer scope)
  const validateNetWeight = createNetWeightValidator(FIELDS)

  // Create a minimal Joi schema that uses the validator
  const createTestSchema = () =>
    Joi.object({
      GROSS_WEIGHT: Joi.number().optional(),
      TARE_WEIGHT: Joi.number().optional(),
      PALLET_WEIGHT: Joi.number().optional(),
      NET_WEIGHT: Joi.number().optional()
    })
      .custom(validateNetWeight)
      .messages(NET_WEIGHT_MESSAGES)
      .prefs({ abortEarly: false })

  describe('when all fields are present', () => {
    it('accepts correct calculation (100 - 20 - 5 = 75)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100,
        TARE_WEIGHT: 20,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 75
      })

      expect(error).toBeUndefined()
    })

    it('accepts calculation with decimals', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100.5,
        TARE_WEIGHT: 20.25,
        PALLET_WEIGHT: 5.1,
        NET_WEIGHT: 75.15
      })

      expect(error).toBeUndefined()
    })

    it('rejects incorrect calculation', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100,
        TARE_WEIGHT: 20,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 80 // Should be 75
      })

      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('custom.netWeightCalculationMismatch')
      expect(error.details[0].message).toBe(
        'must equal GROSS_WEIGHT − TARE_WEIGHT − PALLET_WEIGHT'
      )
    })
  })

  describe('when some fields are missing', () => {
    it('skips validation when NET_WEIGHT is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100,
        TARE_WEIGHT: 20,
        PALLET_WEIGHT: 5
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when GROSS_WEIGHT is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        TARE_WEIGHT: 20,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 75
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when TARE_WEIGHT is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 75
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when PALLET_WEIGHT is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100,
        TARE_WEIGHT: 20,
        NET_WEIGHT: 75
      })

      expect(error).toBeUndefined()
    })
  })

  describe('NET_WEIGHT_MESSAGES', () => {
    it('exports the expected message for netWeightCalculationMismatch', () => {
      expect(NET_WEIGHT_MESSAGES['custom.netWeightCalculationMismatch']).toBe(
        'must equal GROSS_WEIGHT − TARE_WEIGHT − PALLET_WEIGHT'
      )
    })
  })
})
