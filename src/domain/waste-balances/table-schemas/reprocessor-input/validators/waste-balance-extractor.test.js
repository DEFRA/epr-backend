import { describe, it, expect } from 'vitest'
import { extractWasteBalanceFields } from './waste-balance-extractor.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { YES_NO_VALUES } from '#domain/summary-logs/table-schemas/shared/index.js'

describe('extractWasteBalanceFields (REPROCESSOR_INPUT)', () => {
  const validReceivedData = {
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
    DATE_RECEIVED_FOR_REPROCESSING: '2025-01-15',
    WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: YES_NO_VALUES.NO,
    TONNAGE_RECEIVED_FOR_RECYCLING: 100.5
  }

  const validSentOnData = {
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
    DATE_LOAD_LEFT_SITE: '2025-01-20',
    TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 50.25
  }

  it('returns null if processing type is not REPROCESSOR_INPUT', () => {
    const record = {
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        ...validReceivedData,
        processingType: PROCESSING_TYPES.EXPORTER
      }
    }
    expect(extractWasteBalanceFields(record)).toBeNull()
  })

  describe('RECEIVED records', () => {
    it('extracts fields correctly for valid received record', () => {
      const record = {
        type: WASTE_RECORD_TYPE.RECEIVED,
        data: validReceivedData
      }

      const result = extractWasteBalanceFields(record)

      expect(result).toEqual({
        dispatchDate: new Date('2025-01-15'),
        prnIssued: false,
        transactionAmount: 100.5
      })
    })

    it('sets prnIssued to true when YES', () => {
      const record = {
        type: WASTE_RECORD_TYPE.RECEIVED,
        data: {
          ...validReceivedData,
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: YES_NO_VALUES.YES
        }
      }

      const result = extractWasteBalanceFields(record)
      expect(result.prnIssued).toBe(true)
    })

    it('defaults transactionAmount to 0 if missing', () => {
      const record = {
        type: WASTE_RECORD_TYPE.RECEIVED,
        data: {
          ...validReceivedData,
          TONNAGE_RECEIVED_FOR_RECYCLING: undefined
        }
      }

      const result = extractWasteBalanceFields(record)
      expect(result.transactionAmount).toBe(0)
    })

    it('returns null if DATE_RECEIVED_FOR_REPROCESSING is missing', () => {
      const record = {
        type: WASTE_RECORD_TYPE.RECEIVED,
        data: {
          ...validReceivedData,
          DATE_RECEIVED_FOR_REPROCESSING: undefined
        }
      }

      expect(extractWasteBalanceFields(record)).toBeNull()
    })

    it('returns null if validation fails (e.g. invalid date)', () => {
      const record = {
        type: WASTE_RECORD_TYPE.RECEIVED,
        data: {
          ...validReceivedData,
          DATE_RECEIVED_FOR_REPROCESSING: 'invalid-date'
        }
      }

      expect(extractWasteBalanceFields(record)).toBeNull()
    })
  })

  describe('SENT_ON records', () => {
    it('extracts fields correctly for valid sent on record', () => {
      const record = {
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: validSentOnData
      }

      const result = extractWasteBalanceFields(record)

      expect(result).toEqual({
        dispatchDate: new Date('2025-01-20'),
        prnIssued: false,
        transactionAmount: -50.25 // Should be negative
      })
    })

    it('defaults transactionAmount to 0 if missing', () => {
      const record = {
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: {
          ...validSentOnData,
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: undefined
        }
      }

      const result = extractWasteBalanceFields(record)
      expect(result.transactionAmount).toBe(-0)
    })

    it('returns null if DATE_LOAD_LEFT_SITE is missing', () => {
      const record = {
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: {
          ...validSentOnData,
          DATE_LOAD_LEFT_SITE: undefined
        }
      }

      expect(extractWasteBalanceFields(record)).toBeNull()
    })

    it('returns null if validation fails', () => {
      const record = {
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: {
          ...validSentOnData,
          TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 'not-a-number'
        }
      }

      expect(extractWasteBalanceFields(record)).toBeNull()
    })
  })

  it('returns null for unknown record type', () => {
    const record = {
      type: 'UNKNOWN_TYPE',
      data: validReceivedData
    }
    expect(extractWasteBalanceFields(record)).toBeNull()
  })
})
