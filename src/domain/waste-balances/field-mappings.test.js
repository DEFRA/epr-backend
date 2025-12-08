import { describe, it, expect } from 'vitest'
import { getFieldValue, COMMON_FIELD } from './field-mappings.js'
import { WASTE_RECORD_TEMPLATE } from '#domain/waste-records/model.js'

describe('Field Mappings', () => {
  describe('getFieldValue', () => {
    it('throws error when template mapping is not found', () => {
      const record = {
        template: 'INVALID_TEMPLATE',
        data: {}
      }

      expect(() => getFieldValue(record, COMMON_FIELD.DISPATCH_DATE)).toThrow(
        'No field mapping found for template: INVALID_TEMPLATE'
      )
    })

    it('throws error when field mapping is not found', () => {
      const record = {
        template: WASTE_RECORD_TEMPLATE.EXPORTER,
        data: {}
      }

      expect(() => getFieldValue(record, 'INVALID_FIELD')).toThrow(
        `No mapping found for field: INVALID_FIELD in template: ${WASTE_RECORD_TEMPLATE.EXPORTER}`
      )
    })
  })
})
