import { describe, expect, it } from 'vitest'
import { SENT_ON_LOADS } from './sent-on-loads.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { transformSentOnLoadsRow } from '#application/waste-records/row-transformers/sent-on-loads.js'
import { ROW_OUTCOME } from '../validation-pipeline.js'
import { CLASSIFICATION_REASON } from '../shared/classify-helpers.js'

describe('SENT_ON_LOADS (REPROCESSOR_INPUT)', () => {
  const schema = SENT_ON_LOADS

  describe('structure', () => {
    it('has rowIdField set to ROW_ID', () => {
      expect(schema.rowIdField).toBe('ROW_ID')
    })

    it('has wasteRecordType set to SENT_ON', () => {
      expect(schema.wasteRecordType).toBe(WASTE_RECORD_TYPE.SENT_ON)
    })

    it('has sheetName set to Sent on', () => {
      expect(schema.sheetName).toBe('Sent on')
    })

    it('has rowTransformer set to transformSentOnLoadsRow', () => {
      expect(schema.rowTransformer).toBe(transformSentOnLoadsRow)
    })

    describe('requiredHeaders (VAL008 - column presence validation)', () => {
      it('contains all waste balance columns', () => {
        expect(schema.requiredHeaders).toContain('ROW_ID')
        expect(schema.requiredHeaders).toContain('DATE_LOAD_LEFT_SITE')
        expect(schema.requiredHeaders).toContain(
          'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
        )
      })

      it('contains all supplementary columns from template sections', () => {
        expect(schema.requiredHeaders).toContain(
          'FINAL_DESTINATION_FACILITY_TYPE'
        )
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_NAME')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_ADDRESS')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_POSTCODE')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_EMAIL')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_PHONE')
        expect(schema.requiredHeaders).toContain('YOUR_REFERENCE')
        expect(schema.requiredHeaders).toContain('DESCRIPTION_WASTE')
        expect(schema.requiredHeaders).toContain('EWC_CODE')
        expect(schema.requiredHeaders).toContain('WEIGHBRIDGE_TICKET')
      })

      it('has exactly 13 required headers', () => {
        expect(schema.requiredHeaders).toHaveLength(13)
      })
    })

    it('has unfilledValues object', () => {
      expect(typeof schema.unfilledValues).toBe('object')
    })

    it('has validationSchema (Joi schema for VAL010)', () => {
      expect(schema.validationSchema).toBeDefined()
      expect(typeof schema.validationSchema.validate).toBe('function')
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

    describe('ROW_ID validation', () => {
      it('accepts valid ROW_ID at minimum (5000)', () => {
        const { error } = validationSchema.validate({ ROW_ID: 5000 })
        expect(error).toBeUndefined()
      })

      it('accepts valid ROW_ID above minimum', () => {
        const { error } = validationSchema.validate({ ROW_ID: 5500 })
        expect(error).toBeUndefined()
      })

      it('rejects ROW_ID below minimum', () => {
        const { error } = validationSchema.validate({ ROW_ID: 4999 })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 5000')
      })

      it('rejects non-integer ROW_ID', () => {
        const { error } = validationSchema.validate({ ROW_ID: 5000.5 })
        expect(error).toBeDefined()
      })
    })

    describe('DATE_LOAD_LEFT_SITE validation', () => {
      it('accepts valid Date object', () => {
        const { error } = validationSchema.validate({
          DATE_LOAD_LEFT_SITE: new Date('2024-06-15')
        })
        expect(error).toBeUndefined()
      })

      it('accepts date string that can be parsed', () => {
        const { error } = validationSchema.validate({
          DATE_LOAD_LEFT_SITE: '2024-06-15'
        })
        expect(error).toBeUndefined()
      })

      it('rejects invalid date string', () => {
        const { error } = validationSchema.validate({
          DATE_LOAD_LEFT_SITE: 'not-a-date'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a valid date')
      })
    })

    describe('TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON validation', () => {
      it('accepts zero', () => {
        const { error } = validationSchema.validate({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 0
        })
        expect(error).toBeUndefined()
      })

      it('accepts maximum value (1000)', () => {
        const { error } = validationSchema.validate({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 1000
        })
        expect(error).toBeUndefined()
      })

      it('accepts value within range', () => {
        const { error } = validationSchema.validate({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 500.5
        })
        expect(error).toBeUndefined()
      })

      it('accepts small decimal value', () => {
        const { error } = validationSchema.validate({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 0.01
        })
        expect(error).toBeUndefined()
      })

      it('rejects negative value', () => {
        const { error } = validationSchema.validate({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: -1
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at least 0')
      })

      it('rejects value above maximum (1000)', () => {
        const { error } = validationSchema.validate({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 1001
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be at most 1000')
      })

      it('rejects non-number', () => {
        const { error } = validationSchema.validate({
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 'not-a-number'
        })
        expect(error).toBeDefined()
        expect(error.details[0].message).toBe('must be a number')
      })
    })

    describe('multiple field validation', () => {
      it('reports all errors when multiple fields invalid', () => {
        const { error } = validationSchema.validate({
          ROW_ID: 4999,
          DATE_LOAD_LEFT_SITE: 'not-a-date',
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: -1
        })
        expect(error).toBeDefined()
        expect(error.details.length).toBe(3)
      })
    })
  })

  describe('classifyForWasteBalance', () => {
    const accreditation = {
      validFrom: '2024-01-01',
      validTo: '2024-12-31',
      statusHistory: [
        { status: 'created', updatedAt: '2023-12-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2023-12-15T00:00:00.000Z' }
      ]
    }

    const completeRow = {
      ROW_ID: 5000,
      DATE_LOAD_LEFT_SITE: new Date('2024-06-15'),
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 25.5
    }

    describe('INCLUDED outcome', () => {
      it('returns INCLUDED with negative transaction amount (debit)', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
        expect(result.reasons).toEqual([])
        expect(result.transactionAmount).toBe(-25.5)
      })

      it('rounds transaction amount to two decimal places', () => {
        const row = {
          ...completeRow,
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 25.555
        }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.transactionAmount).toBe(-25.56)
      })
    })

    describe('EXCLUDED outcome - missing required fields', () => {
      it('returns EXCLUDED when a required field is missing', () => {
        const row = {
          ROW_ID: 5000,
          DATE_LOAD_LEFT_SITE: new Date('2024-06-15')
        }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.MISSING_REQUIRED_FIELD,
          field: 'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
        })
      })

      it('returns EXCLUDED with all missing fields listed', () => {
        const result = schema.classifyForWasteBalance({}, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons).toHaveLength(3)
      })
    })

    describe('IGNORED outcome - date outside accreditation', () => {
      it('returns IGNORED when date is before accreditation period', () => {
        const row = {
          ...completeRow,
          DATE_LOAD_LEFT_SITE: new Date('2023-12-31')
        }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD
        })
      })

      it('returns IGNORED when date is after accreditation period', () => {
        const row = {
          ...completeRow,
          DATE_LOAD_LEFT_SITE: new Date('2025-01-01')
        }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
      })
    })

    describe('INCLUDED outcome - undefined or null accreditation', () => {
      it('returns INCLUDED when accreditation is undefined (accreditation check passes)', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation: undefined
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
        expect(result.reasons).toEqual([])
      })

      it('returns INCLUDED when accreditation is null (accreditation check passes)', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation: null
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
        expect(result.reasons).toEqual([])
      })

      it('returns INCLUDED when accreditation has empty statusHistory', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation: {
            validFrom: '2024-01-01',
            validTo: '2024-12-31',
            statusHistory: []
          }
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
        expect(result.reasons).toEqual([])
      })
    })

    describe('IGNORED outcome - suspended accreditation', () => {
      it('returns IGNORED when accreditation was suspended before the row date', () => {
        const suspendedAccreditation = {
          validFrom: '2024-01-01',
          validTo: '2024-12-31',
          statusHistory: [
            { status: 'created', updatedAt: '2023-12-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2023-12-15T00:00:00.000Z' },
            { status: 'suspended', updatedAt: '2024-03-01T00:00:00.000Z' }
          ]
        }
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation: suspendedAccreditation
        })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD
        })
      })

      it('returns INCLUDED when accreditation was suspended then re-approved before the row date', () => {
        const reapprovedAccreditation = {
          validFrom: '2024-01-01',
          validTo: '2024-12-31',
          statusHistory: [
            { status: 'created', updatedAt: '2023-12-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2023-12-15T00:00:00.000Z' },
            { status: 'suspended', updatedAt: '2024-03-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2024-04-01T00:00:00.000Z' }
          ]
        }
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation: reapprovedAccreditation
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
      })
    })

    describe('classification priority', () => {
      it('checks required fields before date range', () => {
        const result = schema.classifyForWasteBalance({}, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
        expect(result.reasons[0].code).toBe(
          CLASSIFICATION_REASON.MISSING_REQUIRED_FIELD
        )
      })
    })
  })
})
