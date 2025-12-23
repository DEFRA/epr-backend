import { describe, it, expect } from 'vitest'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { YES_NO_VALUES } from '#domain/summary-logs/table-schemas/shared/index.js'
import {
  RECEIVED_LOADS_FIELDS,
  SENT_ON_LOADS_FIELDS
} from '#domain/summary-logs/table-schemas/reprocessor-input/fields.js'
import {
  extractWasteBalanceFields,
  isWithinAccreditationDateRange
} from './reprocessor-input-extractor.js'

describe('reprocessor-input-extractor', () => {
  describe('extractWasteBalanceFields', () => {
    const validReceivedData = {
      processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
      [RECEIVED_LOADS_FIELDS.DATE_RECEIVED_FOR_REPROCESSING]: '2025-01-20',
      [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]:
        YES_NO_VALUES.NO,
      [RECEIVED_LOADS_FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING]: 100
    }

    const validSentOnData = {
      processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
      [SENT_ON_LOADS_FIELDS.DATE_LOAD_LEFT_SITE]: '2025-01-21',
      [SENT_ON_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON]: 50
    }

    it('should return null if processing type is not REPROCESSOR_INPUT', () => {
      const record = {
        type: WASTE_RECORD_TYPE.RECEIVED,
        data: { ...validReceivedData, processingType: 'EXPORTER' }
      }
      const result = extractWasteBalanceFields(record)
      expect(result).toBeNull()
    })

    it('should extract fields from valid RECEIVED record', () => {
      const record = {
        type: WASTE_RECORD_TYPE.RECEIVED,
        data: validReceivedData
      }
      const result = extractWasteBalanceFields(record)

      expect(result).toEqual({
        dispatchDate: new Date('2025-01-20'),
        prnIssued: false,
        transactionAmount: 100
      })
    })

    it('should return null if RECEIVED record is missing date', () => {
      const data = { ...validReceivedData }
      delete data[RECEIVED_LOADS_FIELDS.DATE_RECEIVED_FOR_REPROCESSING]
      const record = {
        type: WASTE_RECORD_TYPE.RECEIVED,
        data
      }
      const result = extractWasteBalanceFields(record)
      expect(result).toBeNull()
    })

    it('should default transactionAmount to 0 for RECEIVED record if tonnage is missing', () => {
      const data = { ...validReceivedData }
      delete data[RECEIVED_LOADS_FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING]
      const record = {
        type: WASTE_RECORD_TYPE.RECEIVED,
        data
      }
      const result = extractWasteBalanceFields(record)
      expect(result.transactionAmount).toBe(0)
    })

    it('should extract fields from valid SENT_ON record', () => {
      const record = {
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: validSentOnData
      }
      const result = extractWasteBalanceFields(record)

      expect(result).toEqual({
        dispatchDate: new Date('2025-01-21'),
        prnIssued: false,
        transactionAmount: -50
      })
    })

    it('should return null if SENT_ON record is missing date', () => {
      const data = { ...validSentOnData }
      delete data[SENT_ON_LOADS_FIELDS.DATE_LOAD_LEFT_SITE]
      const record = {
        type: WASTE_RECORD_TYPE.SENT_ON,
        data
      }
      const result = extractWasteBalanceFields(record)
      expect(result).toBeNull()
    })

    it('should default transactionAmount to 0 for SENT_ON record if tonnage is missing', () => {
      const data = { ...validSentOnData }
      delete data[SENT_ON_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON]
      const record = {
        type: WASTE_RECORD_TYPE.SENT_ON,
        data
      }
      const result = extractWasteBalanceFields(record)
      expect(result.transactionAmount).toBe(-0)
    })

    it('should return null for unsupported record type', () => {
      const record = {
        type: 'UNSUPPORTED',
        data: validReceivedData
      }
      const result = extractWasteBalanceFields(record)
      expect(result).toBeNull()
    })

    it('should handle prnIssued correctly for RECEIVED record', () => {
      const data = {
        ...validReceivedData,
        [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]:
          YES_NO_VALUES.YES
      }
      const record = {
        type: WASTE_RECORD_TYPE.RECEIVED,
        data
      }
      const result = extractWasteBalanceFields(record)
      expect(result.prnIssued).toBe(true)
    })
  })

  describe('isWithinAccreditationDateRange', () => {
    const accreditation = {
      validFrom: '2025-01-01',
      validTo: '2025-12-31'
    }

    it('should return true if date is within range', () => {
      const date = new Date('2025-06-01')
      expect(isWithinAccreditationDateRange(date, accreditation)).toBe(true)
    })

    it('should return true if date is on start boundary', () => {
      const date = new Date('2025-01-01')
      expect(isWithinAccreditationDateRange(date, accreditation)).toBe(true)
    })

    it('should return true if date is on end boundary', () => {
      const date = new Date('2025-12-31')
      expect(isWithinAccreditationDateRange(date, accreditation)).toBe(true)
    })

    it('should return false if date is before range', () => {
      const date = new Date('2024-12-31')
      expect(isWithinAccreditationDateRange(date, accreditation)).toBe(false)
    })

    it('should return false if date is after range', () => {
      const date = new Date('2026-01-01')
      expect(isWithinAccreditationDateRange(date, accreditation)).toBe(false)
    })
  })
})
