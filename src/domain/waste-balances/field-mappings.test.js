import { describe, it, expect } from 'vitest'
import { getFieldValue, COMMON_FIELD } from './field-mappings.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

describe('Field Mappings', () => {
  describe('getFieldValue', () => {
    it('throws error when processingType is missing', () => {
      const record = {
        data: {}
      }

      expect(() => getFieldValue(record, COMMON_FIELD.DISPATCH_DATE)).toThrow(
        'Waste record missing processingType'
      )
    })

    it('throws error when processingType mapping is not found', () => {
      const record = {
        data: {
          processingType: 'INVALID_TYPE'
        }
      }

      expect(() => getFieldValue(record, COMMON_FIELD.DISPATCH_DATE)).toThrow(
        'No field mapping found for processingType: INVALID_TYPE'
      )
    })

    it('throws error when field mapping is not found', () => {
      const record = {
        data: {
          processingType: PROCESSING_TYPES.EXPORTER
        }
      }

      expect(() => getFieldValue(record, 'INVALID_FIELD')).toThrow(
        `No mapping found for field: INVALID_FIELD in processingType: ${PROCESSING_TYPES.EXPORTER}`
      )
    })
  })
})
