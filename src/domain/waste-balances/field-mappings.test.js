import { describe, it, expect } from 'vitest'
import { getFieldValue } from './field-mappings.js'
import { COMMON_FIELD } from '#domain/summary-logs/constants.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { EXPORTER_FIELD } from './constants.js'

describe('Field Mappings', () => {
  describe('getFieldValue', () => {
    it('throws error when processingType is missing', () => {
      const record = { type: WASTE_RECORD_TYPE.RECEIVED, data: {} }
      expect(() => getFieldValue(record, COMMON_FIELD.DISPATCH_DATE)).toThrow(
        'Waste record missing processingType'
      )
    })

    it('throws error when no mapping exists for processingType', () => {
      const record = {
        type: WASTE_RECORD_TYPE.RECEIVED,
        data: { processingType: 'UNKNOWN_TYPE' }
      }
      expect(() => getFieldValue(record, COMMON_FIELD.DISPATCH_DATE)).toThrow(
        'No field mapping found for processingType: UNKNOWN_TYPE'
      )
    })

    it('throws error when no mapping exists for record type', () => {
      const record = {
        type: 'UNKNOWN_RECORD_TYPE',
        data: { processingType: PROCESSING_TYPES.EXPORTER }
      }
      expect(() => getFieldValue(record, COMMON_FIELD.DISPATCH_DATE)).toThrow(
        'No mapping found for record type: UNKNOWN_RECORD_TYPE in processingType: EXPORTER'
      )
    })

    it('throws error when no mapping exists for the field', () => {
      const record = {
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: { processingType: PROCESSING_TYPES.EXPORTER }
      }
      expect(() => getFieldValue(record, 'UNKNOWN_FIELD')).toThrow(
        'No mapping found for field: UNKNOWN_FIELD in record type: exported for processingType: EXPORTER'
      )
    })

    it('returns the correct value for a valid mapping', () => {
      const record = {
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-01-01'
        }
      }
      expect(getFieldValue(record, COMMON_FIELD.DISPATCH_DATE)).toBe(
        '2023-01-01'
      )
    })
  })
})
