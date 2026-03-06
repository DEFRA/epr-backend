import { describe, expect, it } from 'vitest'
import { SENT_ON_LOADS } from './sent-on-loads.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { transformSentOnLoadsRowExporter } from '#application/waste-records/row-transformers/sent-on-loads-exporter.js'
import { ROW_OUTCOME } from '../validation-pipeline.js'
import { CLASSIFICATION_REASON } from '../shared/classify-helpers.js'

describe('SENT_ON_LOADS (EXPORTER)', () => {
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

    it('has rowTransformer set to transformSentOnLoadsRowExporter', () => {
      expect(schema.rowTransformer).toBe(transformSentOnLoadsRowExporter)
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

    describe('fieldsRequiredForInclusionInWasteBalance (VAL011)', () => {
      it('contains fields required for waste balance calculation', () => {
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'ROW_ID'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'DATE_LOAD_LEFT_SITE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toContain(
          'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
        )
      })

      it('has exactly 3 fields required for waste balance', () => {
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toHaveLength(3)
      })

      it('does NOT contain supplementary columns', () => {
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'FINAL_DESTINATION_FACILITY_TYPE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'FINAL_DESTINATION_NAME'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'FINAL_DESTINATION_ADDRESS'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'FINAL_DESTINATION_POSTCODE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'FINAL_DESTINATION_EMAIL'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'FINAL_DESTINATION_PHONE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'YOUR_REFERENCE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'DESCRIPTION_WASTE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'EWC_CODE'
        )
        expect(schema.fieldsRequiredForInclusionInWasteBalance).not.toContain(
          'WEIGHBRIDGE_TICKET'
        )
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

  describe('classifyForWasteBalance', () => {
    const accreditation = { validFrom: '2025-01-01', validTo: '2025-12-31' }

    const completeRow = {
      ROW_ID: 4200,
      DATE_LOAD_LEFT_SITE: '2025-06-15',
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 10
    }

    describe('INCLUDED outcome', () => {
      it('returns INCLUDED with negative transaction amount', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
        expect(result.reasons).toEqual([])
        expect(result.transactionAmount).toBe(-10)
      })

      it('rounds transaction amount to two decimal places', () => {
        const row = {
          ...completeRow,
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 10.555
        }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.transactionAmount).toBe(-10.56)
      })
    })

    describe('EXCLUDED outcome - missing required fields', () => {
      it('returns EXCLUDED when a required field is missing', () => {
        const row = { ...completeRow }
        delete row.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON
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
        const row = { ...completeRow, DATE_LOAD_LEFT_SITE: '2024-12-31' }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
        expect(result.reasons).toContainEqual({
          code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD
        })
      })

      it('returns IGNORED when date is after accreditation period', () => {
        const row = { ...completeRow, DATE_LOAD_LEFT_SITE: '2026-01-01' }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
      })
    })

    describe('classification priority', () => {
      it('checks required fields before date range', () => {
        const result = schema.classifyForWasteBalance({}, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.EXCLUDED)
      })

      it('checks date range after required fields pass', () => {
        const row = { ...completeRow, DATE_LOAD_LEFT_SITE: '2024-01-01' }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.outcome).toBe(ROW_OUTCOME.IGNORED)
      })
    })
  })

  describe('validationSchema (VAL010)', () => {
    const { validationSchema } = schema

    it('accepts empty object (all fields optional for data validation)', () => {
      const { error } = validationSchema.validate({})
      expect(error).toBeUndefined()
    })

    it('accepts unknown fields', () => {
      const { error } = validationSchema.validate({ UNKNOWN_FIELD: 'value' })
      expect(error).toBeUndefined()
    })
  })
})
