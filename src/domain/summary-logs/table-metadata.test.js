import { describe, it, expect } from 'vitest'
import {
  TABLE_METADATA,
  getRowIdField,
  getWasteRecordType
} from './table-metadata.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

describe('table-metadata', () => {
  describe('TABLE_METADATA', () => {
    it('defines metadata for RECEIVED_LOADS_FOR_REPROCESSING', () => {
      expect(TABLE_METADATA.RECEIVED_LOADS_FOR_REPROCESSING).toEqual({
        rowIdField: 'ROW_ID',
        wasteRecordType: WASTE_RECORD_TYPE.RECEIVED
      })
    })
  })

  describe('getRowIdField', () => {
    it('returns ROW_ID for RECEIVED_LOADS_FOR_REPROCESSING', () => {
      expect(getRowIdField('RECEIVED_LOADS_FOR_REPROCESSING')).toBe('ROW_ID')
    })

    it('returns null for unknown table', () => {
      expect(getRowIdField('UNKNOWN_TABLE')).toBeNull()
    })
  })

  describe('getWasteRecordType', () => {
    it('returns received for RECEIVED_LOADS_FOR_REPROCESSING', () => {
      expect(getWasteRecordType('RECEIVED_LOADS_FOR_REPROCESSING')).toBe(
        WASTE_RECORD_TYPE.RECEIVED
      )
    })

    it('returns null for unknown table', () => {
      expect(getWasteRecordType('UNKNOWN_TABLE')).toBeNull()
    })
  })
})
