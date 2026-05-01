import { describe, it, expect } from 'vitest'
import { ObjectId } from 'mongodb'

import {
  ledgerTransactionInsertSchema,
  ledgerTransactionReadSchema,
  LEDGER_TRANSACTION_TYPE,
  LEDGER_SOURCE_KIND
} from './ledger-schema.js'
import { buildLedgerTransaction } from './ledger-test-data.js'

describe('ledger transaction insert schema', () => {
  describe('valid documents', () => {
    it('accepts a summary-log-row transaction', () => {
      const data = buildLedgerTransaction()
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts all transaction types', () => {
      for (const type of Object.values(LEDGER_TRANSACTION_TYPE)) {
        const data = buildLedgerTransaction({ type })
        const { error } = ledgerTransactionInsertSchema.validate(data)
        expect(error).toBeUndefined()
      }
    })

    it('accepts negative amount for debit', () => {
      const data = buildLedgerTransaction({
        type: LEDGER_TRANSACTION_TYPE.DEBIT,
        amount: -5,
        closingBalance: { amount: -5, availableAmount: -5 }
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts closing totals equal to zero', () => {
      const data = buildLedgerTransaction({
        amount: 0,
        closingBalance: { amount: 0, availableAmount: 0 }
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })
  })

  describe('required top-level fields', () => {
    const topLevelRequired = [
      'accreditationId',
      'organisationId',
      'registrationId',
      'number',
      'type',
      'createdAt',
      'amount',
      'openingBalance',
      'closingBalance',
      'source'
    ]

    for (const field of topLevelRequired) {
      it(`rejects when ${field} is missing`, () => {
        const data = buildLedgerTransaction()
        delete data[field]
        const { error } = ledgerTransactionInsertSchema.validate(data)
        expect(error).toBeDefined()
      })
    }
  })

  describe('balance snapshot fields', () => {
    const snapshotKeys = ['openingBalance', 'closingBalance']
    const innerKeys = ['amount', 'availableAmount']

    for (const snapshotKey of snapshotKeys) {
      for (const innerKey of innerKeys) {
        it(`rejects when ${snapshotKey}.${innerKey} is missing`, () => {
          const data = buildLedgerTransaction()
          delete data[snapshotKey][innerKey]
          const { error } = ledgerTransactionInsertSchema.validate(data)
          expect(error).toBeDefined()
        })
      }
    }
  })

  describe('number field', () => {
    it('rejects zero', () => {
      const data = buildLedgerTransaction({ number: 0 })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects negative values', () => {
      const data = buildLedgerTransaction({ number: -1 })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects non-integer values', () => {
      const data = buildLedgerTransaction({ number: 1.5 })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('accepts any positive integer', () => {
      const data = buildLedgerTransaction({ number: 12345 })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })
  })

  describe('type field', () => {
    it('rejects invalid type value', () => {
      const data = buildLedgerTransaction({ type: 'sideways' })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })
  })

  describe('createdBy field', () => {
    it('accepts when createdBy is absent (system-generated transactions)', () => {
      const data = buildLedgerTransaction()
      delete data.createdBy
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('rejects when createdBy.id is missing', () => {
      const data = buildLedgerTransaction({ createdBy: { name: 'x' } })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when createdBy.name is missing', () => {
      const data = buildLedgerTransaction({ createdBy: { id: 'user-1' } })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })
  })

  describe('source discriminated union', () => {
    it('rejects when source.kind is missing', () => {
      const data = buildLedgerTransaction({
        source: { summaryLogRow: { summaryLogId: 'log-1' } }
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects an unknown source.kind', () => {
      const data = buildLedgerTransaction({
        source: { kind: 'alien-invasion' }
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects summary-log-row kind when summaryLogRow is missing', () => {
      const data = buildLedgerTransaction({
        source: { kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW }
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })
  })

  describe('summary-log-row source fields', () => {
    it('rejects when source.summaryLogRow.summaryLogId is missing', () => {
      const data = buildLedgerTransaction()
      delete data.source.summaryLogRow.summaryLogId
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when source.summaryLogRow.wasteRecord is missing', () => {
      const data = buildLedgerTransaction()
      delete data.source.summaryLogRow.wasteRecord
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    const wasteRecordRequired = ['type', 'rowId', 'versionId', 'creditedAmount']
    for (const field of wasteRecordRequired) {
      it(`rejects when source.summaryLogRow.wasteRecord.${field} is missing`, () => {
        const data = buildLedgerTransaction()
        delete data.source.summaryLogRow.wasteRecord[field]
        const { error } = ledgerTransactionInsertSchema.validate(data)
        expect(error).toBeDefined()
      })
    }

    it('rejects an unknown wasteRecord.type', () => {
      const data = buildLedgerTransaction({
        source: {
          kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
          summaryLogRow: {
            summaryLogId: 'log-1',
            wasteRecord: {
              type: 'mystery',
              rowId: 'row-1',
              versionId: 'v-1',
              creditedAmount: 10
            }
          }
        }
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('accepts all documented wasteRecord.type values', () => {
      const types = ['received', 'processed', 'sentOn', 'exported']
      for (const type of types) {
        const data = buildLedgerTransaction({
          source: {
            kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
            summaryLogRow: {
              summaryLogId: 'log-1',
              wasteRecord: {
                type,
                rowId: 'row-1',
                versionId: 'v-1',
                creditedAmount: 10
              }
            }
          }
        })
        const { error } = ledgerTransactionInsertSchema.validate(data)
        expect(error).toBeUndefined()
      }
    })
  })

  describe('unknown fields', () => {
    it('strips unknown top-level fields when stripUnknown is enabled', () => {
      const data = buildLedgerTransaction({ bogus: 'field' })
      const { error, value } = ledgerTransactionInsertSchema.validate(data, {
        stripUnknown: true
      })
      expect(error).toBeUndefined()
      expect(value.bogus).toBeUndefined()
    })
  })
})

describe('ledger transaction read schema', () => {
  const buildReadDocument = (overrides = {}) => ({
    id: '507f1f77bcf86cd799439011',
    ...buildLedgerTransaction(),
    ...overrides
  })

  it('accepts a valid read document with id', () => {
    const data = buildReadDocument()
    const { error } = ledgerTransactionReadSchema.validate(data)
    expect(error).toBeUndefined()
  })

  it('rejects when id is missing', () => {
    const data = buildReadDocument()
    delete data.id
    const { error } = ledgerTransactionReadSchema.validate(data)
    expect(error).toBeDefined()
  })

  it('strips MongoDB _id when stripUnknown is enabled', () => {
    const objectId = new ObjectId()
    const data = { ...buildReadDocument(), _id: objectId }
    const { error, value } = ledgerTransactionReadSchema.validate(data, {
      stripUnknown: true
    })
    expect(error).toBeUndefined()
    expect(value._id).toBeUndefined()
    expect(value.id).toBeDefined()
  })

  it('rejects when required fields from insert schema are missing', () => {
    const data = buildReadDocument()
    delete data.source
    const { error } = ledgerTransactionReadSchema.validate(data)
    expect(error).toBeDefined()
  })
})
