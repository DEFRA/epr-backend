import { describe, it, expect } from 'vitest'
import { Decimal128 } from 'mongodb'

import {
  streamInsertToMongo,
  streamDocumentFromMongo
} from './stream-decimal.js'
import { buildStreamEvent, buildPrnCreatedEvent } from './stream-test-data.js'

describe('stream-decimal', () => {
  describe('streamInsertToMongo', () => {
    it('converts balance snapshot fields to Decimal128 for summary-log-submitted', () => {
      const event = buildStreamEvent({
        openingBalance: { amount: 0, availableAmount: 0 },
        closingBalance: { amount: 100.5, availableAmount: 100.5 },
        payload: { summaryLogId: 'log-1', creditTotal: 100.5 }
      })

      const result = streamInsertToMongo(event)

      expect(result.openingBalance.amount).toBeInstanceOf(Decimal128)
      expect(result.openingBalance.availableAmount).toBeInstanceOf(Decimal128)
      expect(result.closingBalance.amount).toBeInstanceOf(Decimal128)
      expect(result.closingBalance.availableAmount).toBeInstanceOf(Decimal128)
      expect(result.payload.creditTotal).toBeInstanceOf(Decimal128)
      expect(result.payload.summaryLogId).toBe('log-1')
    })

    it('converts payload amount to Decimal128 for PRN events', () => {
      const event = buildPrnCreatedEvent({
        payload: { prnId: 'prn-1', amount: 50.25 }
      })

      const result = streamInsertToMongo(event)

      expect(result.payload.amount).toBeInstanceOf(Decimal128)
      expect(result.payload.prnId).toBe('prn-1')
    })

    it('preserves non-amount fields unchanged', () => {
      const event = buildStreamEvent()
      const result = streamInsertToMongo(event)

      expect(result.registrationId).toBe(event.registrationId)
      expect(result.accreditationId).toBe(event.accreditationId)
      expect(result.organisationId).toBe(event.organisationId)
      expect(result.number).toBe(event.number)
      expect(result.kind).toBe(event.kind)
      expect(result.createdAt).toBe(event.createdAt)
      expect(result.createdBy).toEqual(event.createdBy)
    })
  })

  describe('streamDocumentFromMongo', () => {
    it('round-trips a summary-log-submitted event through encode/decode', () => {
      const event = buildStreamEvent({
        openingBalance: { amount: 10.5, availableAmount: 8.3 },
        closingBalance: { amount: 110.5, availableAmount: 108.3 },
        payload: { summaryLogId: 'log-rt', creditTotal: 100 }
      })

      const encoded = streamInsertToMongo(event)
      const decoded = streamDocumentFromMongo(encoded)

      expect(decoded.openingBalance).toEqual({
        amount: 10.5,
        availableAmount: 8.3
      })
      expect(decoded.closingBalance).toEqual({
        amount: 110.5,
        availableAmount: 108.3
      })
      expect(decoded.payload).toEqual({
        summaryLogId: 'log-rt',
        creditTotal: 100
      })
    })

    it('round-trips a PRN event through encode/decode', () => {
      const event = buildPrnCreatedEvent({
        payload: { prnId: 'prn-rt', amount: 75.005 }
      })

      const encoded = streamInsertToMongo(event)
      const decoded = streamDocumentFromMongo(encoded)

      expect(decoded.payload).toEqual({ prnId: 'prn-rt', amount: 75.005 })
    })
  })
})
