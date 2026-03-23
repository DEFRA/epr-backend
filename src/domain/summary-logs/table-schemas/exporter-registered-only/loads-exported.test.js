import { describe, expect, it } from 'vitest'
import { TABLE_SCHEMAS } from './index.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { transformLoadsExportedRowRegisteredOnly } from '#application/waste-records/row-transformers/loads-exported-exporter-registered-only.js'

const { LOADS_EXPORTED } = TABLE_SCHEMAS

describe('LOADS_EXPORTED (EXPORTER_REGISTERED_ONLY)', () => {
  const schema = LOADS_EXPORTED

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    it('has wasteRecordType set to EXPORTED', () => {
      expect(schema.wasteRecordType).toBe(WASTE_RECORD_TYPE.EXPORTED)
    })

    it('has sheetName set to Exported (sections 2 and 3)', () => {
      expect(schema.sheetName).toBe('Exported (sections 2 and 3)')
    })

    it('has rowTransformer set to transformLoadsExportedRowRegisteredOnly', () => {
      expect(schema.rowTransformer).toBe(
        transformLoadsExportedRowRegisteredOnly
      )
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

    it('treats BASEL_EXPORT_CODE as unfilled dropdown', () => {
      expect(schema.unfilledValues.BASEL_EXPORT_CODE).toContain('Choose option')
    })

    it('treats WAS_THE_WASTE_REFUSED as unfilled dropdown', () => {
      expect(schema.unfilledValues.WAS_THE_WASTE_REFUSED).toContain(
        'Choose option'
      )
    })

    it('treats WAS_THE_WASTE_STOPPED as unfilled dropdown', () => {
      expect(schema.unfilledValues.WAS_THE_WASTE_STOPPED).toContain(
        'Choose option'
      )
    })

    it('treats OSR_COUNTRY as unfilled dropdown', () => {
      expect(schema.unfilledValues.OSR_COUNTRY).toContain('Choose option')
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

    it('validates ROW_ID as integer >= 2000', () => {
      const valid = validationSchema.validate({ ROW_ID: 2000 })
      expect(valid.error).toBeUndefined()

      const tooLow = validationSchema.validate({ ROW_ID: 1999 })
      expect(tooLow.error).toBeDefined()

      const notInteger = validationSchema.validate({ ROW_ID: 2000.5 })
      expect(notInteger.error).toBeDefined()
    })

    it('validates TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED as number >= 0 with no upper bound', () => {
      const valid = validationSchema.validate({
        TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5.0
      })
      expect(valid.error).toBeUndefined()

      const negative = validationSchema.validate({
        TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: -1
      })
      expect(negative.error).toBeDefined()

      const large = validationSchema.validate({
        TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 50000
      })
      expect(large.error).toBeUndefined()
    })

    it('validates DATE_OF_EXPORT as date', () => {
      const valid = validationSchema.validate({
        DATE_OF_EXPORT: new Date('2025-03-01')
      })
      expect(valid.error).toBeUndefined()

      const invalid = validationSchema.validate({
        DATE_OF_EXPORT: 'not a date'
      })
      expect(invalid.error).toBeDefined()
    })

    it('validates OSR_ID as 3-digit number (1-999)', () => {
      const valid = validationSchema.validate({ OSR_ID: 123 })
      expect(valid.error).toBeUndefined()

      const tooLow = validationSchema.validate({ OSR_ID: 0 })
      expect(tooLow.error).toBeDefined()

      const tooHigh = validationSchema.validate({ OSR_ID: 1000 })
      expect(tooHigh.error).toBeDefined()
    })

    it('validates BASEL_EXPORT_CODE as valid Basel code', () => {
      const valid = validationSchema.validate({ BASEL_EXPORT_CODE: 'B3020' })
      expect(valid.error).toBeUndefined()

      const invalid = validationSchema.validate({
        BASEL_EXPORT_CODE: 'INVALID_CODE'
      })
      expect(invalid.error).toBeDefined()
    })

    it('validates WAS_THE_WASTE_REFUSED as Yes/No', () => {
      const yes = validationSchema.validate({ WAS_THE_WASTE_REFUSED: 'Yes' })
      expect(yes.error).toBeUndefined()

      const no = validationSchema.validate({ WAS_THE_WASTE_REFUSED: 'No' })
      expect(no.error).toBeUndefined()

      const invalid = validationSchema.validate({
        WAS_THE_WASTE_REFUSED: 'Maybe'
      })
      expect(invalid.error).toBeDefined()
    })

    it('validates WAS_THE_WASTE_STOPPED as Yes/No', () => {
      const yes = validationSchema.validate({ WAS_THE_WASTE_STOPPED: 'Yes' })
      expect(yes.error).toBeUndefined()

      const invalid = validationSchema.validate({
        WAS_THE_WASTE_STOPPED: 'Maybe'
      })
      expect(invalid.error).toBeDefined()
    })

    it('validates DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED as date', () => {
      const valid = validationSchema.validate({
        DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: new Date('2025-06-15')
      })
      expect(valid.error).toBeUndefined()

      const invalid = validationSchema.validate({
        DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: 'not a date'
      })
      expect(invalid.error).toBeDefined()
    })

    it('validates CUSTOMS_CODES as free text', () => {
      const valid = validationSchema.validate({ CUSTOMS_CODES: '12345' })
      expect(valid.error).toBeUndefined()
    })

    it('validates CONTAINER_NUMBER as free text', () => {
      const valid = validationSchema.validate({
        CONTAINER_NUMBER: 'ABCD1234567'
      })
      expect(valid.error).toBeUndefined()
    })
  })
})
