import { describe, expect, it } from 'vitest'
import Joi from 'joi'
import {
  validateTonnageReceived,
  extractTonnageReceivedFields,
  TONNAGE_RECEIVED_MESSAGES
} from './tonnage-received-validator.js'

describe('extractTonnageReceivedFields', () => {
  describe('when all fields are present and valid', () => {
    it('returns strongly-typed object with only tonnage fields', () => {
      const row = {
        ROW_ID: 1001,
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'Yes',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 71.892,
        OTHER_FIELD: 'ignored'
      }

      const result = extractTonnageReceivedFields(row)

      expect(result).toEqual({
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'Yes',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 71.892
      })
    })

    it('strips unknown fields from the result', () => {
      const row = {
        NET_WEIGHT: 50,
        WEIGHT_OF_NON_TARGET_MATERIALS: 5,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.9,
        TONNAGE_RECEIVED_FOR_RECYCLING: 40.5,
        EXTRA_FIELD_1: 'should not appear',
        EXTRA_FIELD_2: 12345
      }

      const result = extractTonnageReceivedFields(row)

      expect(result).not.toHaveProperty('EXTRA_FIELD_1')
      expect(result).not.toHaveProperty('EXTRA_FIELD_2')
      expect(Object.keys(result)).toHaveLength(5)
    })
  })

  describe('when fields are missing', () => {
    it('returns null when NET_WEIGHT is missing', () => {
      const row = {
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 72
      }

      expect(extractTonnageReceivedFields(row)).toBeNull()
    })

    it('returns null when WEIGHT_OF_NON_TARGET_MATERIALS is missing', () => {
      const row = {
        NET_WEIGHT: 100,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 72
      }

      expect(extractTonnageReceivedFields(row)).toBeNull()
    })

    it('returns null when BAILING_WIRE_PROTOCOL is missing', () => {
      const row = {
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 72
      }

      expect(extractTonnageReceivedFields(row)).toBeNull()
    })

    it('returns null when RECYCLABLE_PROPORTION_PERCENTAGE is missing', () => {
      const row = {
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        TONNAGE_RECEIVED_FOR_RECYCLING: 72
      }

      expect(extractTonnageReceivedFields(row)).toBeNull()
    })

    it('returns null when TONNAGE_RECEIVED_FOR_RECYCLING is missing', () => {
      const row = {
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8
      }

      expect(extractTonnageReceivedFields(row)).toBeNull()
    })

    it('returns null when row is empty', () => {
      expect(extractTonnageReceivedFields({})).toBeNull()
    })
  })

  describe('when fields have invalid types', () => {
    it('returns null when NET_WEIGHT is not a number', () => {
      const row = {
        NET_WEIGHT: 'not a number',
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 72
      }

      expect(extractTonnageReceivedFields(row)).toBeNull()
    })

    it('returns null when BAILING_WIRE_PROTOCOL is not Yes or No', () => {
      const row = {
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'Maybe',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 72
      }

      expect(extractTonnageReceivedFields(row)).toBeNull()
    })

    it('returns null when RECYCLABLE_PROPORTION_PERCENTAGE is out of range', () => {
      const row = {
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 1.5,
        TONNAGE_RECEIVED_FOR_RECYCLING: 72
      }

      expect(extractTonnageReceivedFields(row)).toBeNull()
    })

    it('returns null when NET_WEIGHT is negative', () => {
      const row = {
        NET_WEIGHT: -100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 72
      }

      expect(extractTonnageReceivedFields(row)).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('accepts zero values', () => {
      const row = {
        NET_WEIGHT: 0,
        WEIGHT_OF_NON_TARGET_MATERIALS: 0,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0,
        TONNAGE_RECEIVED_FOR_RECYCLING: 0
      }

      const result = extractTonnageReceivedFields(row)

      expect(result).toEqual({
        NET_WEIGHT: 0,
        WEIGHT_OF_NON_TARGET_MATERIALS: 0,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0,
        TONNAGE_RECEIVED_FOR_RECYCLING: 0
      })
    })

    it('accepts boundary percentage values', () => {
      const rowMin = {
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0,
        TONNAGE_RECEIVED_FOR_RECYCLING: 0
      }

      const rowMax = {
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 1,
        TONNAGE_RECEIVED_FOR_RECYCLING: 90
      }

      expect(extractTonnageReceivedFields(rowMin)).not.toBeNull()
      expect(extractTonnageReceivedFields(rowMax)).not.toBeNull()
    })
  })
})

describe('validateTonnageReceived', () => {
  // Create a minimal Joi schema that uses the validator
  const createTestSchema = () =>
    Joi.object({
      NET_WEIGHT: Joi.number().optional(),
      WEIGHT_OF_NON_TARGET_MATERIALS: Joi.number().optional(),
      BAILING_WIRE_PROTOCOL: Joi.string().optional(),
      RECYCLABLE_PROPORTION_PERCENTAGE: Joi.number().optional(),
      TONNAGE_RECEIVED_FOR_RECYCLING: Joi.number().optional()
    })
      .custom(validateTonnageReceived)
      .messages(TONNAGE_RECEIVED_MESSAGES)
      .prefs({ abortEarly: false })

  describe('when all fields are present (BAILING_WIRE_PROTOCOL = No)', () => {
    it('accepts correct calculation ((100 - 10) * 0.8 = 72)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 72
      })

      expect(error).toBeUndefined()
    })

    it('accepts correct calculation with decimals ((50.5 - 5.5) * 0.975 = 43.875)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 50.5,
        WEIGHT_OF_NON_TARGET_MATERIALS: 5.5,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.975,
        TONNAGE_RECEIVED_FOR_RECYCLING: 43.875
      })

      expect(error).toBeUndefined()
    })

    it('accepts zero result when recyclable proportion is zero', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0,
        TONNAGE_RECEIVED_FOR_RECYCLING: 0
      })

      expect(error).toBeUndefined()
    })

    it('accepts zero result when net equals non-target materials', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 50,
        WEIGHT_OF_NON_TARGET_MATERIALS: 50,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 0
      })

      expect(error).toBeUndefined()
    })

    it('accepts calculation when non-target materials is zero ((100 - 0) * 0.5 = 50)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 0,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.5,
        TONNAGE_RECEIVED_FOR_RECYCLING: 50
      })

      expect(error).toBeUndefined()
    })

    it('accepts 100% recyclable proportion ((100 - 10) * 1 = 90)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 1,
        TONNAGE_RECEIVED_FOR_RECYCLING: 90
      })

      expect(error).toBeUndefined()
    })

    it('rejects incorrect calculation', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 80 // Should be 72
      })

      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('custom.tonnageCalculationMismatch')
      expect(error.details[0].message).toBe(
        'must equal the calculated tonnage based on NET_WEIGHT, WEIGHT_OF_NON_TARGET_MATERIALS, BAILING_WIRE_PROTOCOL, and RECYCLABLE_PROPORTION_PERCENTAGE'
      )
    })

    it('rejects calculation outside tolerance (off by 0.01)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 72.01
      })

      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('custom.tonnageCalculationMismatch')
    })
  })

  describe('when all fields are present (BAILING_WIRE_PROTOCOL = Yes)', () => {
    // Formula: (NET - NON_TARGET) * 0.9985 * RECYCLABLE_PROPORTION
    // Example: (100 - 10) * 0.9985 * 0.8 = 90 * 0.9985 * 0.8 = 71.892

    it('accepts correct calculation with bailing wire deduction ((100 - 10) * 0.9985 * 0.8 = 71.892)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'Yes',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 71.892
      })

      expect(error).toBeUndefined()
    })

    it('accepts correct calculation with 100% recyclable and bailing wire ((100 - 0) * 0.9985 * 1 = 99.85)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 0,
        BAILING_WIRE_PROTOCOL: 'Yes',
        RECYCLABLE_PROPORTION_PERCENTAGE: 1,
        TONNAGE_RECEIVED_FOR_RECYCLING: 99.85
      })

      expect(error).toBeUndefined()
    })

    it('accepts zero result when recyclable proportion is zero with bailing wire', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'Yes',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0,
        TONNAGE_RECEIVED_FOR_RECYCLING: 0
      })

      expect(error).toBeUndefined()
    })

    it('rejects calculation without bailing wire deduction when protocol is Yes', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'Yes',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 72 // Wrong - should be 71.892 with deduction
      })

      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('custom.tonnageCalculationMismatch')
    })

    it('rejects calculation with incorrect bailing wire factor', () => {
      const schema = createTestSchema()
      // Using wrong factor: 90 * 0.99 * 0.8 = 71.28 (instead of 71.892)
      const { error } = schema.validate({
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'Yes',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 71.28
      })

      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('custom.tonnageCalculationMismatch')
    })
  })

  describe('when some fields are missing', () => {
    it('skips validation when TONNAGE_RECEIVED_FOR_RECYCLING is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when NET_WEIGHT is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 72
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when WEIGHT_OF_NON_TARGET_MATERIALS is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 100,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 72
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when BAILING_WIRE_PROTOCOL is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: 72
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when RECYCLABLE_PROPORTION_PERCENTAGE is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        TONNAGE_RECEIVED_FOR_RECYCLING: 72
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when all fields are missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({})

      expect(error).toBeUndefined()
    })

    it('skips validation when only TONNAGE_RECEIVED_FOR_RECYCLING is present', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        TONNAGE_RECEIVED_FOR_RECYCLING: 72
      })

      expect(error).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('handles large numbers correctly', () => {
      const schema = createTestSchema()
      // (999 - 100) * 0.975 = 899 * 0.975 = 876.525
      const { error } = schema.validate({
        NET_WEIGHT: 999,
        WEIGHT_OF_NON_TARGET_MATERIALS: 100,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.975,
        TONNAGE_RECEIVED_FOR_RECYCLING: 876.525
      })

      expect(error).toBeUndefined()
    })

    it('handles very small decimal differences within tolerance', () => {
      const schema = createTestSchema()
      // Testing floating point arithmetic
      const { error } = schema.validate({
        NET_WEIGHT: 0.3,
        WEIGHT_OF_NON_TARGET_MATERIALS: 0.1,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.5,
        TONNAGE_RECEIVED_FOR_RECYCLING: 0.1 // (0.3 - 0.1) * 0.5 = 0.1
      })

      expect(error).toBeUndefined()
    })

    it('handles bailing wire calculation with many decimal places', () => {
      const schema = createTestSchema()
      // (50.123 - 5.456) * 0.9985 * 0.875 = 44.667 * 0.9985 * 0.875 = 39.0164...
      const baseWeight = 50.123 - 5.456
      const expected = baseWeight * 0.9985 * 0.875

      const { error } = schema.validate({
        NET_WEIGHT: 50.123,
        WEIGHT_OF_NON_TARGET_MATERIALS: 5.456,
        BAILING_WIRE_PROTOCOL: 'Yes',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.875,
        TONNAGE_RECEIVED_FOR_RECYCLING: expected
      })

      expect(error).toBeUndefined()
    })

    it('validates correctly when base weight is negative (invalid scenario)', () => {
      const schema = createTestSchema()
      // This is a logically invalid scenario but we should still validate the calculation
      // (10 - 20) * 0.8 = -10 * 0.8 = -8
      const { error } = schema.validate({
        NET_WEIGHT: 10,
        WEIGHT_OF_NON_TARGET_MATERIALS: 20,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_RECYCLING: -8
      })

      expect(error).toBeUndefined() // Calculation is mathematically correct
    })

    it('handles the exact 0.15% bailing wire deduction correctly', () => {
      const schema = createTestSchema()
      // 0.15% = 0.0015, factor = 0.9985
      // (1000 - 0) * 0.9985 * 1 = 998.5
      const { error } = schema.validate({
        NET_WEIGHT: 1000,
        WEIGHT_OF_NON_TARGET_MATERIALS: 0,
        BAILING_WIRE_PROTOCOL: 'Yes',
        RECYCLABLE_PROPORTION_PERCENTAGE: 1,
        TONNAGE_RECEIVED_FOR_RECYCLING: 998.5
      })

      expect(error).toBeUndefined()
    })
  })
})
