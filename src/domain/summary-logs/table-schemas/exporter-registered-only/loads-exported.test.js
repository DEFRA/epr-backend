import { describe, expect, it } from 'vitest'
import { TABLE_SCHEMAS } from './index.js'

const { LOADS_EXPORTED } = TABLE_SCHEMAS

describe('LOADS_EXPORTED (EXPORTER_REGISTERED_ONLY)', () => {
  const schema = LOADS_EXPORTED

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    describe('requiredHeaders (VAL008 - column presence validation)', () => {
      it('contains ROW_ID', () => {
        expect(schema.requiredHeaders).toContain('ROW_ID')
      })

      it('contains export event fields', () => {
        expect(schema.requiredHeaders).toContain(
          'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED'
        )
        expect(schema.requiredHeaders).toContain('DATE_OF_EXPORT')
        expect(schema.requiredHeaders).toContain('OSR_ID')
        expect(schema.requiredHeaders).toContain('BASEL_EXPORT_CODE')
      })

      it('contains waste refused/stopped fields', () => {
        expect(schema.requiredHeaders).toContain('WAS_THE_WASTE_REFUSED')
        expect(schema.requiredHeaders).toContain('WAS_THE_WASTE_STOPPED')
        expect(schema.requiredHeaders).toContain(
          'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
        )
      })

      it('contains OSR detail fields', () => {
        expect(schema.requiredHeaders).toContain('OSR_NAME')
        expect(schema.requiredHeaders).toContain('OSR_COUNTRY')
      })

      it('contains shipment fields', () => {
        expect(schema.requiredHeaders).toContain('CUSTOMS_CODES')
        expect(schema.requiredHeaders).toContain('CONTAINER_NUMBER')
      })

      it('has exactly 12 required headers', () => {
        expect(schema.requiredHeaders).toHaveLength(12)
      })
    })

    it('has unfilledValues object', () => {
      expect(typeof schema.unfilledValues).toBe('object')
    })

    it('has validationSchema with validate function', () => {
      expect(schema.validationSchema).toBeDefined()
      expect(typeof schema.validationSchema.validate).toBe('function')
    })

    describe('fieldsRequiredForInclusionInWasteBalance (VAL011)', () => {
      it('is empty (registered-only operators have no waste balance)', () => {
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toEqual([])
      })
    })
  })

  describe('validationSchema (VAL010)', () => {
    const { validationSchema } = schema

    it('accepts empty object (all fields optional)', () => {
      const { error } = validationSchema.validate({})
      expect(error).toBeUndefined()
    })

    it('accepts unknown fields', () => {
      const { error } = validationSchema.validate({ UNKNOWN_FIELD: 'value' })
      expect(error).toBeUndefined()
    })
  })
})
