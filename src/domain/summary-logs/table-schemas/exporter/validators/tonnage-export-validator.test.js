import { describe, expect, it } from 'vitest'
import Joi from 'joi'
import {
  validateTonnageExport,
  extractTonnageExportFields,
  TONNAGE_EXPORT_MESSAGES
} from './tonnage-export-validator.js'
import { expectValidationError } from '#common/validation/validation-test-helpers.js'

describe('extractTonnageExportFields', () => {
  describe('when all fields are present and valid', () => {
    it('returns strongly-typed object with only tonnage fields', () => {
      const row = {
        ROW_ID: 1001,
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'Yes',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_EXPORT: 71.892,
        OTHER_FIELD: 'ignored'
      }

      const result = extractTonnageExportFields(row)

      expect(result).toEqual({
        netWeight: 100,
        weightOfNonTargetMaterials: 10,
        bailingWireProtocol: true,
        recyclableProportionPercentage: 0.8,
        tonnageReceivedForExport: 71.892
      })
    })

    it('strips unknown fields from the result', () => {
      const row = {
        NET_WEIGHT: 50,
        WEIGHT_OF_NON_TARGET_MATERIALS: 5,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.9,
        TONNAGE_RECEIVED_FOR_EXPORT: 40.5,
        EXTRA_FIELD_1: 'should not appear',
        EXTRA_FIELD_2: 12345
      }

      const result = extractTonnageExportFields(row)

      if (result === null) {
        throw new Error('expected tonnage fields to be extracted')
      }

      expect(Object.keys(result)).toEqual([
        'netWeight',
        'weightOfNonTargetMaterials',
        'bailingWireProtocol',
        'recyclableProportionPercentage',
        'tonnageReceivedForExport'
      ])
    })
  })

  describe('when fields are missing', () => {
    const completeRow = {
      NET_WEIGHT: 100,
      WEIGHT_OF_NON_TARGET_MATERIALS: 10,
      BAILING_WIRE_PROTOCOL: 'No',
      RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
      TONNAGE_RECEIVED_FOR_EXPORT: 72
    }

    it.each([
      'NET_WEIGHT',
      'WEIGHT_OF_NON_TARGET_MATERIALS',
      'BAILING_WIRE_PROTOCOL',
      'RECYCLABLE_PROPORTION_PERCENTAGE',
      'TONNAGE_RECEIVED_FOR_EXPORT'
    ])('returns null when %s is missing', (missingField) => {
      const row = { ...completeRow }
      delete row[missingField]

      expect(extractTonnageExportFields(row)).toBeNull()
    })

    it('returns null when row is empty', () => {
      expect(extractTonnageExportFields({})).toBeNull()
    })
  })

  describe('when fields have invalid types', () => {
    it('returns null when NET_WEIGHT is not a number', () => {
      const row = {
        NET_WEIGHT: 'not a number',
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_EXPORT: 72
      }

      expect(extractTonnageExportFields(row)).toBeNull()
    })

    it('returns null when BAILING_WIRE_PROTOCOL is not Yes or No', () => {
      const row = {
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'Maybe',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_EXPORT: 72
      }

      expect(extractTonnageExportFields(row)).toBeNull()
    })

    it('returns null when RECYCLABLE_PROPORTION_PERCENTAGE is out of range', () => {
      const row = {
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 1.5, // Must be 0-1
        TONNAGE_RECEIVED_FOR_EXPORT: 72
      }

      expect(extractTonnageExportFields(row)).toBeNull()
    })

    it('returns null when NET_WEIGHT is negative', () => {
      const row = {
        NET_WEIGHT: -100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_EXPORT: 72
      }

      expect(extractTonnageExportFields(row)).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('accepts zero values', () => {
      const row = {
        NET_WEIGHT: 0,
        WEIGHT_OF_NON_TARGET_MATERIALS: 0,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0,
        TONNAGE_RECEIVED_FOR_EXPORT: 0
      }

      const result = extractTonnageExportFields(row)

      expect(result).toEqual({
        netWeight: 0,
        weightOfNonTargetMaterials: 0,
        bailingWireProtocol: false,
        recyclableProportionPercentage: 0,
        tonnageReceivedForExport: 0
      })
    })

    it('accepts boundary percentage values', () => {
      const rowMin = {
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0,
        TONNAGE_RECEIVED_FOR_EXPORT: 0
      }

      const rowMax = {
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 1,
        TONNAGE_RECEIVED_FOR_EXPORT: 90
      }

      expect(extractTonnageExportFields(rowMin)).not.toBeNull()
      expect(extractTonnageExportFields(rowMax)).not.toBeNull()
    })
  })
})

describe('validateTonnageExport', () => {
  // Create a minimal Joi schema that uses the validator
  const createTestSchema = () =>
    Joi.object({
      NET_WEIGHT: Joi.number().optional(),
      WEIGHT_OF_NON_TARGET_MATERIALS: Joi.number().optional(),
      BAILING_WIRE_PROTOCOL: Joi.string().optional(),
      RECYCLABLE_PROPORTION_PERCENTAGE: Joi.number().optional(),
      TONNAGE_RECEIVED_FOR_EXPORT: Joi.number().optional()
    })
      .custom(validateTonnageExport)
      .messages(TONNAGE_EXPORT_MESSAGES)
      .prefs({ abortEarly: false })

  describe('when all fields are present (BAILING_WIRE_PROTOCOL = No)', () => {
    it.each([
      {
        netWeight: 100,
        nonTarget: 10,
        recyclablePct: 0.8,
        tonnage: 72,
        description: '(100 - 10) * 0.8 = 72'
      },
      {
        netWeight: 50.5,
        nonTarget: 5.5,
        recyclablePct: 0.975,
        tonnage: 43.875,
        description: '(50.5 - 5.5) * 0.975 = 43.875'
      },
      {
        netWeight: 100,
        nonTarget: 10,
        recyclablePct: 0,
        tonnage: 0,
        description: 'zero result when recyclable proportion is zero'
      },
      {
        netWeight: 50,
        nonTarget: 50,
        recyclablePct: 0.8,
        tonnage: 0,
        description: 'zero result when net equals non-target materials'
      },
      {
        netWeight: 100,
        nonTarget: 0,
        recyclablePct: 0.5,
        tonnage: 50,
        description: '(100 - 0) * 0.5 = 50'
      },
      {
        netWeight: 100,
        nonTarget: 10,
        recyclablePct: 1,
        tonnage: 90,
        description: '100% recyclable proportion (100 - 10) * 1 = 90'
      }
    ])(
      'accepts correct calculation: $description',
      ({ netWeight, nonTarget, recyclablePct, tonnage }) => {
        const schema = createTestSchema()
        const { error } = schema.validate({
          NET_WEIGHT: netWeight,
          WEIGHT_OF_NON_TARGET_MATERIALS: nonTarget,
          BAILING_WIRE_PROTOCOL: 'No',
          RECYCLABLE_PROPORTION_PERCENTAGE: recyclablePct,
          TONNAGE_RECEIVED_FOR_EXPORT: tonnage
        })

        expect(error).toBeUndefined()
      }
    )

    it('rejects incorrect calculation', () => {
      const schema = createTestSchema()
      const details = expectValidationError(schema, {
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_EXPORT: 80 // Should be 72
      })

      expect(details[0].type).toBe('custom.tonnageCalculationMismatch')
      expect(details[0].message).toBe(
        'must equal the calculated tonnage based on NET_WEIGHT, WEIGHT_OF_NON_TARGET_MATERIALS, BAILING_WIRE_PROTOCOL, and RECYCLABLE_PROPORTION_PERCENTAGE'
      )
    })

    it('rejects calculation outside tolerance (off by 0.01)', () => {
      const schema = createTestSchema()
      const details = expectValidationError(schema, {
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_EXPORT: 72.01
      })

      expect(details[0].type).toBe('custom.tonnageCalculationMismatch')
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
        TONNAGE_RECEIVED_FOR_EXPORT: 71.892
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
        TONNAGE_RECEIVED_FOR_EXPORT: 99.85
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
        TONNAGE_RECEIVED_FOR_EXPORT: 0
      })

      expect(error).toBeUndefined()
    })

    it('rejects calculation without bailing wire deduction when protocol is Yes', () => {
      const schema = createTestSchema()
      const details = expectValidationError(schema, {
        NET_WEIGHT: 100,
        WEIGHT_OF_NON_TARGET_MATERIALS: 10,
        BAILING_WIRE_PROTOCOL: 'Yes',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
        TONNAGE_RECEIVED_FOR_EXPORT: 72 // Wrong - should be 71.892 with deduction
      })

      expect(details[0].type).toBe('custom.tonnageCalculationMismatch')
    })
  })

  describe('when some fields are missing', () => {
    const completeRow = {
      NET_WEIGHT: 100,
      WEIGHT_OF_NON_TARGET_MATERIALS: 10,
      BAILING_WIRE_PROTOCOL: 'No',
      RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
      TONNAGE_RECEIVED_FOR_EXPORT: 72
    }

    it.each([
      'TONNAGE_RECEIVED_FOR_EXPORT',
      'NET_WEIGHT',
      'WEIGHT_OF_NON_TARGET_MATERIALS',
      'BAILING_WIRE_PROTOCOL',
      'RECYCLABLE_PROPORTION_PERCENTAGE'
    ])('skips validation when %s is missing', (missingField) => {
      const schema = createTestSchema()
      const row = { ...completeRow }
      delete row[missingField]
      const { error } = schema.validate(row)

      expect(error).toBeUndefined()
    })

    it('skips validation when all fields are missing', () => {
      const schema = createTestSchema()
      const { error } = schema.validate({})

      expect(error).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('handles large numbers correctly without bailing wire', () => {
      const schema = createTestSchema()
      // (900 - 100) * 0.95 = 760
      const { error } = schema.validate({
        NET_WEIGHT: 900,
        WEIGHT_OF_NON_TARGET_MATERIALS: 100,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.95,
        TONNAGE_RECEIVED_FOR_EXPORT: 760
      })

      expect(error).toBeUndefined()
    })

    it('handles large numbers correctly with bailing wire', () => {
      const schema = createTestSchema()
      // (900 - 100) * 0.9985 * 0.95 = 800 * 0.9985 * 0.95 = 758.86
      const { error } = schema.validate({
        NET_WEIGHT: 900,
        WEIGHT_OF_NON_TARGET_MATERIALS: 100,
        BAILING_WIRE_PROTOCOL: 'Yes',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.95,
        TONNAGE_RECEIVED_FOR_EXPORT: 758.86
      })

      expect(error).toBeUndefined()
    })

    it('handles very small values correctly', () => {
      const schema = createTestSchema()
      // (1 - 0.1) * 0.9 = 0.81
      const { error } = schema.validate({
        NET_WEIGHT: 1,
        WEIGHT_OF_NON_TARGET_MATERIALS: 0.1,
        BAILING_WIRE_PROTOCOL: 'No',
        RECYCLABLE_PROPORTION_PERCENTAGE: 0.9,
        TONNAGE_RECEIVED_FOR_EXPORT: 0.81
      })

      expect(error).toBeUndefined()
    })
  })
})
