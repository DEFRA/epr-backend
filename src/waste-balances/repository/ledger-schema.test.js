import { describe, it, expect } from 'vitest'
import { ObjectId } from 'mongodb'

import {
  ledgerTransactionInsertSchema,
  ledgerTransactionReadSchema,
  LEDGER_TRANSACTION_TYPE,
  LEDGER_SOURCE_KIND,
  LEDGER_PRN_OPERATION_TYPE
} from './ledger-schema.js'
import {
  buildLedgerTransaction,
  buildPrnOperationLedgerTransaction,
  buildManualAdjustmentLedgerTransaction
} from './ledger-test-data.js'

describe('ledger transaction insert schema', () => {
  describe('valid documents', () => {
    it('accepts a summary-log-row transaction', () => {
      const data = buildLedgerTransaction()
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts a prn-operation transaction', () => {
      const data = buildPrnOperationLedgerTransaction()
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts a manual-adjustment transaction', () => {
      const data = buildManualAdjustmentLedgerTransaction()
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

    it('accepts all PRN operation types', () => {
      for (const operationType of Object.values(LEDGER_PRN_OPERATION_TYPE)) {
        const data = buildPrnOperationLedgerTransaction({
          source: {
            kind: LEDGER_SOURCE_KIND.PRN_OPERATION,
            prnOperation: { prnId: 'prn-1', operationType }
          }
        })
        const { error } = ledgerTransactionInsertSchema.validate(data)
        expect(error).toBeUndefined()
      }
    })

    it('accepts negative amount for debit', () => {
      const data = buildLedgerTransaction({
        type: LEDGER_TRANSACTION_TYPE.DEBIT,
        amount: -5,
        closingAmount: -5
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeUndefined()
    })

    it('accepts closing totals equal to zero', () => {
      const data = buildLedgerTransaction({
        amount: 0,
        closingAmount: 0,
        closingAvailableAmount: 0
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
      'openingAmount',
      'closingAmount',
      'openingAvailableAmount',
      'closingAvailableAmount',
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

    it('rejects summary-log-row kind when prnOperation is also present', () => {
      const data = buildLedgerTransaction({
        source: {
          kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
          summaryLogRow: {
            summaryLogId: 'log-1',
            rowId: 'row-1',
            rowType: 'received',
            wasteRecordId: 'wr-1',
            wasteRecordVersionId: 'v-1'
          },
          prnOperation: {
            prnId: 'prn-1',
            operationType: LEDGER_PRN_OPERATION_TYPE.CREATION
          }
        }
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects prn-operation kind when prnOperation is missing', () => {
      const data = buildLedgerTransaction({
        source: { kind: LEDGER_SOURCE_KIND.PRN_OPERATION }
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects manual-adjustment kind when manualAdjustment is missing', () => {
      const data = buildLedgerTransaction({
        source: { kind: LEDGER_SOURCE_KIND.MANUAL_ADJUSTMENT }
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })
  })

  describe('summary-log-row source fields', () => {
    const required = [
      'summaryLogId',
      'rowId',
      'rowType',
      'wasteRecordId',
      'wasteRecordVersionId'
    ]

    for (const field of required) {
      it(`rejects when source.summaryLogRow.${field} is missing`, () => {
        const data = buildLedgerTransaction()
        delete data.source.summaryLogRow[field]
        const { error } = ledgerTransactionInsertSchema.validate(data)
        expect(error).toBeDefined()
      })
    }

    it('rejects an unknown rowType', () => {
      const data = buildLedgerTransaction({
        source: {
          kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
          summaryLogRow: {
            summaryLogId: 'log-1',
            rowId: 'row-1',
            rowType: 'mystery',
            wasteRecordId: 'wr-1',
            wasteRecordVersionId: 'v-1'
          }
        }
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('accepts all documented rowType values', () => {
      const rowTypes = ['received', 'processed', 'sentOn', 'exported']
      for (const rowType of rowTypes) {
        const data = buildLedgerTransaction({
          source: {
            kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
            summaryLogRow: {
              summaryLogId: 'log-1',
              rowId: 'row-1',
              rowType,
              wasteRecordId: 'wr-1',
              wasteRecordVersionId: 'v-1'
            }
          }
        })
        const { error } = ledgerTransactionInsertSchema.validate(data)
        expect(error).toBeUndefined()
      }
    })
  })

  describe('prn-operation source fields', () => {
    it('rejects when prnId is missing', () => {
      const data = buildPrnOperationLedgerTransaction({
        source: {
          kind: LEDGER_SOURCE_KIND.PRN_OPERATION,
          prnOperation: { operationType: LEDGER_PRN_OPERATION_TYPE.CREATION }
        }
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when operationType is missing', () => {
      const data = buildPrnOperationLedgerTransaction({
        source: {
          kind: LEDGER_SOURCE_KIND.PRN_OPERATION,
          prnOperation: { prnId: 'prn-1' }
        }
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects an unknown operationType', () => {
      const data = buildPrnOperationLedgerTransaction({
        source: {
          kind: LEDGER_SOURCE_KIND.PRN_OPERATION,
          prnOperation: { prnId: 'prn-1', operationType: 'teleportation' }
        }
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })
  })

  describe('manual-adjustment source fields', () => {
    it('rejects when userId is missing', () => {
      const data = buildManualAdjustmentLedgerTransaction({
        source: {
          kind: LEDGER_SOURCE_KIND.MANUAL_ADJUSTMENT,
          manualAdjustment: { reason: 'typo' }
        }
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
    })

    it('rejects when reason is missing', () => {
      const data = buildManualAdjustmentLedgerTransaction({
        source: {
          kind: LEDGER_SOURCE_KIND.MANUAL_ADJUSTMENT,
          manualAdjustment: { userId: 'user-1' }
        }
      })
      const { error } = ledgerTransactionInsertSchema.validate(data)
      expect(error).toBeDefined()
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
