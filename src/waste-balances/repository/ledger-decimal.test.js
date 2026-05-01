import { Decimal128 } from 'mongodb'
import { describe, it, expect } from 'vitest'

import {
  ledgerDocumentFromMongo,
  ledgerInsertToMongo
} from './ledger-decimal.js'
import { buildLedgerTransaction } from './ledger-test-data.js'

describe('ledgerInsertToMongo', () => {
  it('converts the top-level amount to BSON Decimal128', () => {
    const persistable = ledgerInsertToMongo(
      buildLedgerTransaction({ amount: 1.5 })
    )
    expect(persistable.amount).toBeInstanceOf(Decimal128)
    expect(persistable.amount.toString()).toBe('1.5')
  })

  it('converts opening and closing snapshot amounts to BSON Decimal128', () => {
    const persistable = ledgerInsertToMongo(
      buildLedgerTransaction({
        openingBalance: { amount: 0, availableAmount: 0 },
        closingBalance: { amount: 1.5, availableAmount: 1.5 }
      })
    )
    expect(persistable.openingBalance.amount).toBeInstanceOf(Decimal128)
    expect(persistable.openingBalance.availableAmount).toBeInstanceOf(
      Decimal128
    )
    expect(persistable.closingBalance.amount).toBeInstanceOf(Decimal128)
    expect(persistable.closingBalance.availableAmount).toBeInstanceOf(
      Decimal128
    )
    expect(persistable.closingBalance.amount.toString()).toBe('1.5')
  })

  it('preserves non-amount fields verbatim', () => {
    const transaction = buildLedgerTransaction({
      accreditationId: 'acc-x',
      number: 7
    })
    const persistable = ledgerInsertToMongo(transaction)
    expect(persistable.accreditationId).toBe('acc-x')
    expect(persistable.number).toBe(7)
    expect(persistable.source.kind).toBe(transaction.source.kind)
    expect(persistable.source.summaryLogRow.summaryLogId).toBe(
      transaction.source.summaryLogRow.summaryLogId
    )
    expect(persistable.source.summaryLogRow.wasteRecord.type).toBe(
      transaction.source.summaryLogRow.wasteRecord.type
    )
  })

  it('converts source.summaryLogRow.wasteRecord.creditedAmount to Decimal128', () => {
    const persistable = ledgerInsertToMongo(
      buildLedgerTransaction({
        source: {
          kind: 'summary-log-row',
          summaryLogRow: {
            summaryLogId: 'log-1',
            wasteRecord: {
              type: 'received',
              rowId: 'row-1',
              versionId: 'v-1',
              creditedAmount: 12.34
            }
          }
        }
      })
    )
    expect(
      persistable.source.summaryLogRow.wasteRecord.creditedAmount
    ).toBeInstanceOf(Decimal128)
    expect(
      persistable.source.summaryLogRow.wasteRecord.creditedAmount.toString()
    ).toBe('12.34')
  })
})

describe('ledgerDocumentFromMongo', () => {
  it('converts BSON Decimal128 amounts back to JS numbers', () => {
    const fromMongo = ledgerDocumentFromMongo({
      ...buildLedgerTransaction(),
      amount: Decimal128.fromString('1.5'),
      openingBalance: {
        amount: Decimal128.fromString('0'),
        availableAmount: Decimal128.fromString('0')
      },
      closingBalance: {
        amount: Decimal128.fromString('1.5'),
        availableAmount: Decimal128.fromString('1.5')
      }
    })
    expect(fromMongo.amount).toBe(1.5)
    expect(fromMongo.closingBalance.amount).toBe(1.5)
    expect(fromMongo.closingBalance.availableAmount).toBe(1.5)
  })

  it('round-trips finite-precision values exactly', () => {
    const original = buildLedgerTransaction({
      amount: 200.005,
      closingBalance: { amount: 200.005, availableAmount: 200.005 }
    })
    const decoded = ledgerDocumentFromMongo(ledgerInsertToMongo(original))
    expect(decoded.amount).toBe(200.005)
    expect(decoded.closingBalance.amount).toBe(200.005)
    expect(decoded.closingBalance.availableAmount).toBe(200.005)
  })

  it('round-trips wasteRecord.creditedAmount through Decimal128', () => {
    const original = buildLedgerTransaction({
      source: {
        kind: 'summary-log-row',
        summaryLogRow: {
          summaryLogId: 'log-1',
          wasteRecord: {
            type: 'received',
            rowId: 'row-1',
            versionId: 'v-1',
            creditedAmount: 200.005
          }
        }
      }
    })
    const decoded = ledgerDocumentFromMongo(ledgerInsertToMongo(original))
    expect(decoded.source.summaryLogRow.wasteRecord.creditedAmount).toBe(
      200.005
    )
  })

  it('round-trips negative amounts', () => {
    const decoded = ledgerDocumentFromMongo(
      ledgerInsertToMongo(
        buildLedgerTransaction({
          amount: -42.5,
          closingBalance: { amount: -42.5, availableAmount: -42.5 }
        })
      )
    )
    expect(decoded.amount).toBe(-42.5)
    expect(decoded.closingBalance.amount).toBe(-42.5)
  })
})
