import { describe, expect, it } from 'vitest'
import Joi from 'joi'
import {
  validateUkPackagingWeightProportion,
  UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES
} from './uk-packaging-weight-proportion-validator.js'

describe('validateUkPackagingWeightProportion', () => {
  // Create a minimal Joi schema that uses the validator
  const createTestSchema = () =>
    Joi.object({
      PRODUCT_TONNAGE: Joi.number().optional(),
      UK_PACKAGING_WEIGHT_PERCENTAGE: Joi.number().optional(),
      PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: Joi.number().optional()
    })
      .custom(validateUkPackagingWeightProportion)
      .messages(UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES)
      .prefs({ abortEarly: false })

  describe('when all fields are present', () => {
    it('accepts correct calculation (500 × 0.75 = 375)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        PRODUCT_TONNAGE: 500,
        UK_PACKAGING_WEIGHT_PERCENTAGE: 0.75,
        PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 375
      })

      expect(error).toBeUndefined()
    })

    it('accepts correct calculation with decimals (750.76 × 0.5 = 375.38)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        PRODUCT_TONNAGE: 750.76,
        UK_PACKAGING_WEIGHT_PERCENTAGE: 0.5,
        PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 375.38
      })

      expect(error).toBeUndefined()
    })

    it('accepts calculation within floating-point tolerance', () => {
      const schema = createTestSchema()
      // 100 × 0.3 = 30 (but may have FP representation issues)
      const { error } = schema.validate({
        PRODUCT_TONNAGE: 100,
        UK_PACKAGING_WEIGHT_PERCENTAGE: 0.3,
        PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 30
      })

      expect(error).toBeUndefined()
    })

    it('accepts zero result when tonnage is zero (0 × 0.5 = 0)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        PRODUCT_TONNAGE: 0,
        UK_PACKAGING_WEIGHT_PERCENTAGE: 0.5,
        PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 0
      })

      expect(error).toBeUndefined()
    })

    it('accepts zero result when percentage is zero (500 × 0 = 0)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        PRODUCT_TONNAGE: 500,
        UK_PACKAGING_WEIGHT_PERCENTAGE: 0,
        PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 0
      })

      expect(error).toBeUndefined()
    })

    it('rejects incorrect calculation', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        PRODUCT_TONNAGE: 500,
        UK_PACKAGING_WEIGHT_PERCENTAGE: 0.75,
        PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 400 // Should be 375
      })

      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('custom.calculationMismatch')
      expect(error.details[0].message).toBe(
        'must equal PRODUCT_TONNAGE × UK_PACKAGING_WEIGHT_PERCENTAGE'
      )
    })

    it('rejects calculation outside tolerance (off by 0.001)', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        PRODUCT_TONNAGE: 500,
        UK_PACKAGING_WEIGHT_PERCENTAGE: 0.75,
        PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 375.001
      })

      expect(error).toBeDefined()
      expect(error.details[0].type).toBe('custom.calculationMismatch')
    })

    it('includes field name in error context', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        PRODUCT_TONNAGE: 500,
        UK_PACKAGING_WEIGHT_PERCENTAGE: 0.75,
        PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 999
      })

      expect(error).toBeDefined()
      expect(error.details[0].context.field).toBe(
        'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION'
      )
    })
  })

  describe('when fields are missing', () => {
    it('skips validation when PRODUCT_TONNAGE is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        UK_PACKAGING_WEIGHT_PERCENTAGE: 0.75,
        PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 375
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when UK_PACKAGING_WEIGHT_PERCENTAGE is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        PRODUCT_TONNAGE: 500,
        PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 375
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION is missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        PRODUCT_TONNAGE: 500,
        UK_PACKAGING_WEIGHT_PERCENTAGE: 0.75
      })

      expect(error).toBeUndefined()
    })

    it('skips validation when all three fields are missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({})

      expect(error).toBeUndefined()
    })

    it('skips validation when only one field is present', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({
        PRODUCT_TONNAGE: 500
      })

      expect(error).toBeUndefined()
    })
  })

  describe('UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES', () => {
    it('exports calculationMismatch message', () => {
      expect(
        UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES['custom.calculationMismatch']
      ).toBe('must equal PRODUCT_TONNAGE × UK_PACKAGING_WEIGHT_PERCENTAGE')
    })
  })
})
