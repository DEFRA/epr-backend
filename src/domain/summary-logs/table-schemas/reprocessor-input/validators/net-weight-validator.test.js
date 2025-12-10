import { describe, expect, it } from 'vitest'
import Joi from 'joi'
import {
  validateNetWeight,
  NET_WEIGHT_MESSAGES
} from './net-weight-validator.js'

describe('validateNetWeight', () => {
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
    it('accepts correct calculation (100 - 5 - 5 = 90)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100,
        TARE_WEIGHT: 5,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 90
      })

      expect(error).toBeUndefined()
    })

    it('accepts correct calculation with decimals (100.5 - 10.25 - 5.25 = 85)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100.5,
        TARE_WEIGHT: 10.25,
        PALLET_WEIGHT: 5.25,
        NET_WEIGHT: 85
      })

      expect(error).toBeUndefined()
    })

    it('accepts calculation within floating-point tolerance', () => {
      const schema = createTestSchema()
      // 100 - 33.33 - 33.33 = 33.34 (may have FP representation issues)
      const { error } = schema.validate({
        GROSS_WEIGHT: 100,
        TARE_WEIGHT: 33.33,
        PALLET_WEIGHT: 33.33,
        NET_WEIGHT: 33.34
      })

      expect(error).toBeUndefined()
    })

    it('accepts zero result when gross equals tare plus pallet (50 - 25 - 25 = 0)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 50,
        TARE_WEIGHT: 25,
        PALLET_WEIGHT: 25,
        NET_WEIGHT: 0
      })

      expect(error).toBeUndefined()
    })

    it('accepts zero result when all weights are zero (0 - 0 - 0 = 0)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 0,
        TARE_WEIGHT: 0,
        PALLET_WEIGHT: 0,
        NET_WEIGHT: 0
      })

      expect(error).toBeUndefined()
    })

    it('accepts calculation when tare and pallet are zero (100 - 0 - 0 = 100)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100,
        TARE_WEIGHT: 0,
        PALLET_WEIGHT: 0,
        NET_WEIGHT: 100
      })

      expect(error).toBeUndefined()
    })

    it('rejects incorrect calculation', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100,
        TARE_WEIGHT: 5,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 100 // Should be 90
      })

      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('custom.calculationMismatch')
      expect(error.details[0].message).toBe(
        'must equal GROSS_WEIGHT − TARE_WEIGHT − PALLET_WEIGHT'
      )
    })

    it('rejects calculation outside tolerance (off by 0.001)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100,
        TARE_WEIGHT: 5,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 90.001
      })

      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('custom.calculationMismatch')
    })

    it('rejects calculation when net weight is too low', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100,
        TARE_WEIGHT: 5,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 80 // Should be 90
      })

      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('custom.calculationMismatch')
    })

    it('rejects calculation when net weight is significantly different', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 500,
        TARE_WEIGHT: 50,
        PALLET_WEIGHT: 25,
        NET_WEIGHT: 500 // Should be 425
      })

      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('custom.calculationMismatch')
    })
  })

  describe('when some fields are missing', () => {
    it('skips validation when NET_WEIGHT is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100,
        TARE_WEIGHT: 5,
        PALLET_WEIGHT: 5
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when GROSS_WEIGHT is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        TARE_WEIGHT: 5,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 90
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when TARE_WEIGHT is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 90
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when PALLET_WEIGHT is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100,
        TARE_WEIGHT: 5,
        NET_WEIGHT: 90
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when all weight fields are missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({})

      expect(error).toBeUndefined()
    })

    it('skips validation when only NET_WEIGHT is present', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        NET_WEIGHT: 90
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when only GROSS_WEIGHT and NET_WEIGHT are present', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 100,
        NET_WEIGHT: 90
      })

      expect(error).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('handles large numbers correctly', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        GROSS_WEIGHT: 999.99,
        TARE_WEIGHT: 99.99,
        PALLET_WEIGHT: 100,
        NET_WEIGHT: 800
      })

      expect(error).toBeUndefined()
    })

    it('handles very small decimal differences within tolerance', () => {
      const schema = createTestSchema()
      // Testing floating point arithmetic: 0.1 + 0.2 !== 0.3 in JS
      const { error } = schema.validate({
        GROSS_WEIGHT: 0.3,
        TARE_WEIGHT: 0.1,
        PALLET_WEIGHT: 0.1,
        NET_WEIGHT: 0.1
      })

      expect(error).toBeUndefined()
    })

    it('validates correctly when result should be negative (invalid scenario)', () => {
      const schema = createTestSchema()
      // This is a logically invalid scenario but we should still validate the calculation
      const { error } = schema.validate({
        GROSS_WEIGHT: 10,
        TARE_WEIGHT: 15,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: -10
      })

      expect(error).toBeUndefined() // Calculation is correct: 10 - 15 - 5 = -10
    })
  })
})
