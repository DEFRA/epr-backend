import { describe, it, expect } from 'vitest'
import { transformExportLoadsRow } from './received-loads-export.js'
import { transformReceivedLoadsRow } from './received-loads-reprocessing.js'
import { transformSentOnLoadsRow } from './sent-on-loads.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

describe('Row Transformers', () => {
  describe('transformExportLoadsRow', () => {
    it('throws error if ROW_ID is missing', () => {
      expect(() =>
        transformExportLoadsRow({}, 1, PROCESSING_TYPES.EXPORTER)
      ).toThrow('Missing ROW_ID at row 1')
    })
  })

  describe('transformReceivedLoadsRow', () => {
    it('throws error if ROW_ID is missing', () => {
      expect(() =>
        transformReceivedLoadsRow({}, 1, PROCESSING_TYPES.REPROCESSOR_INPUT)
      ).toThrow('Missing ROW_ID at row 1')
    })

    it('throws error if DATE_RECEIVED_FOR_REPROCESSING is missing', () => {
      expect(() =>
        transformReceivedLoadsRow(
          { ROW_ID: '1' },
          1,
          PROCESSING_TYPES.REPROCESSOR_INPUT
        )
      ).toThrow('Missing DATE_RECEIVED_FOR_REPROCESSING at row 1')
    })
  })

  describe('transformSentOnLoadsRow', () => {
    it('transforms valid sent on load row', () => {
      const rowData = {
        ROW_ID: 'row-1',
        DATE_LOAD_LEFT_SITE: '2025-01-15'
      }
      const result = transformSentOnLoadsRow(
        rowData,
        1,
        PROCESSING_TYPES.REPROCESSOR_INPUT
      )
      expect(result.rowId).toBe('row-1')
      expect(result.data.DATE_LOAD_LEFT_SITE).toBe('2025-01-15')
    })

    it('throws error if ROW_ID is missing', () => {
      expect(() =>
        transformSentOnLoadsRow({}, 1, PROCESSING_TYPES.REPROCESSOR_INPUT)
      ).toThrow('Missing ROW_ID at row 1')
    })

    it('throws error if DATE_LOAD_LEFT_SITE is missing', () => {
      expect(() =>
        transformSentOnLoadsRow(
          { ROW_ID: '1' },
          1,
          PROCESSING_TYPES.REPROCESSOR_INPUT
        )
      ).toThrow('Missing DATE_LOAD_LEFT_SITE at row 1')
    })
  })
})
