import { describe, expect, it } from 'vitest'
import Joi from 'joi'
import {
  createNetWeightValidator,
  NET_WEIGHT_MESSAGES
} from './net-weight-validator.js'

describe('createNetWeightValidator', () => {
  // Define test field names
  const FIELDS = {
    GROSS_WEIGHT: 'GROSS_WEIGHT',
    TARE_WEIGHT: 'TARE_WEIGHT',
    PALLET_WEIGHT: 'PALLET_WEIGHT',
    NET_WEIGHT: 'NET_WEIGHT'
  }

  // Create validator using factory
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
