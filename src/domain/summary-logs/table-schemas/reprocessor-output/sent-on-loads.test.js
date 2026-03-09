import { describe, expect, it } from 'vitest'
import { SENT_ON_LOADS } from './sent-on-loads.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { transformSentOnLoadsRowReprocessorOutput } from '#application/waste-records/row-transformers/sent-on-loads-reprocessor-output.js'
import { ROW_OUTCOME } from '../validation-pipeline.js'
import { CLASSIFICATION_REASON } from '../shared/classify-helpers.js'

describe('SENT_ON_LOADS (REPROCESSOR_OUTPUT)', () => {
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

    it('has rowTransformer set to transformSentOnLoadsRowReprocessorOutput', () => {
      expect(schema.rowTransformer).toBe(
        transformSentOnLoadsRowReprocessorOutput
      )
    })

    describe('requiredHeaders (VAL008 - column presence validation)', () => {
      it('contains ROW_ID column', () => {
        expect(schema.requiredHeaders).toContain('ROW_ID')
      })

      it('contains mandatory columns (all optional for REPROCESSOR_OUTPUT)', () => {
        expect(schema.requiredHeaders).toContain('DATE_LOAD_LEFT_SITE')
        expect(schema.requiredHeaders).toContain(
          'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON'
        )
      })

      it('contains final destination columns', () => {
        expect(schema.requiredHeaders).toContain(
          'FINAL_DESTINATION_FACILITY_TYPE'
        )
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_NAME')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_ADDRESS')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_POSTCODE')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_EMAIL')
        expect(schema.requiredHeaders).toContain('FINAL_DESTINATION_PHONE')
      })

      it('contains additional columns', () => {
        expect(schema.requiredHeaders).toContain('YOUR_REFERENCE')
        expect(schema.requiredHeaders).toContain('DESCRIPTION_WASTE')
      })

      it('has exactly 11 required headers (all optional for REPROCESSOR_OUTPUT)', () => {
        expect(schema.requiredHeaders).toHaveLength(11)
      })
    })

    describe('fieldsRequiredForInclusionInWasteBalance (VAL011)', () => {
      it('is empty (table does not contribute to waste balance for REPROCESSOR_OUTPUT)', () => {
        expect(schema.fieldsRequiredForInclusionInWasteBalance).toHaveLength(0)
      })
    })

    it('has unfilledValues with dropdown placeholders matching template', () => {
      expect(schema.unfilledValues.FINAL_DESTINATION_FACILITY_TYPE).toContain(
        'Choose option'
      )
      expect(schema.unfilledValues.DESCRIPTION_WASTE).toContain('Choose option')
    })

    it('has validationSchema (Joi schema for VAL010)', () => {
      expect(schema.validationSchema).toBeDefined()
      expect(typeof schema.validationSchema.validate).toBe('function')
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

  describe('classifyForWasteBalance', () => {
    const accreditation = { validFrom: '2024-01-01', validTo: '2024-12-31' }

    const completeRow = {
      ROW_ID: 5000,
      DATE_LOAD_LEFT_SITE: new Date('2024-06-15'),
      TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 30.25
    }

    describe('INCLUDED outcome', () => {
      it('returns INCLUDED with negative transaction amount (debit)', () => {
        const result = schema.classifyForWasteBalance(completeRow, {
          accreditation
        })
        expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)
        expect(result.reasons).toEqual([])
        expect(result.transactionAmount).toBe(-30.25)
      })

      it('rounds transaction amount to two decimal places', () => {
        const row = {
          ...completeRow,
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 30.255
        }
        const result = schema.classifyForWasteBalance(row, { accreditation })
        expect(result.transactionAmount).toBe(-30.26)
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
  })
})
