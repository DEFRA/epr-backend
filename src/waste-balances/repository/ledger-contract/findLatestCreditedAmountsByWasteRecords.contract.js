import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerTransaction } from '../ledger-test-data.js'
import { LEDGER_SOURCE_KIND } from '../ledger-schema.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

const buildSummaryLogRowTransaction = ({
  accreditationId = 'acc-1',
  number,
  amount,
  closingBalance,
  type = WASTE_RECORD_TYPE.RECEIVED,
  rowId = 'row-1',
  versionId = `version-${number}`,
  creditedAmount
}) =>
  buildLedgerTransaction({
    accreditationId,
    number,
    amount,
    closingBalance,
    source: {
      kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
      summaryLogRow: {
        summaryLogId: 'log-1',
        wasteRecord: { type, rowId, versionId, creditedAmount }
      }
    }
  })

const buildPrnOperationTransaction = ({ accreditationId = 'acc-1', number }) =>
  buildLedgerTransaction({
    accreditationId,
    number,
    source: {
      kind: 'prn-operation',
      prnOperation: { prnId: 'prn-1', operationType: 'creation' }
    }
  })

export const testFindLatestCreditedAmountsByWasteRecordsBehaviour = (it) => {
  describe('findLatestCreditedAmountsByWasteRecords', () => {
    let repository

    beforeEach(async ({ ledgerRepository }) => {
      repository = await ledgerRepository()
    })

    it('returns a lookup that yields 0 for an empty input', async () => {
      const lookup = await repository.findLatestCreditedAmountsByWasteRecords(
        'acc-1',
        []
      )
      expect(typeof lookup).toBe('function')
      expect(
        lookup({ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'whatever' })
      ).toBe(0)
    })

    it('returns 0 for waste records with no prior transaction', async () => {
      const lookup = await repository.findLatestCreditedAmountsByWasteRecords(
        'acc-1',
        [{ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'never-touched' }]
      )
      expect(
        lookup({ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'never-touched' })
      ).toBe(0)
    })

    it('returns the creditedAmount on the latest matching transaction', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 100,
          closingBalance: { amount: 100, availableAmount: 100 },
          rowId: 'wr-a',
          creditedAmount: 100
        })
      ])

      const lookup = await repository.findLatestCreditedAmountsByWasteRecords(
        'acc-1',
        [{ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-a' }]
      )

      expect(lookup({ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-a' })).toBe(
        100
      )
    })

    it('uses the highest-numbered matching transaction (running total) when multiple exist', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 100,
          closingBalance: { amount: 100, availableAmount: 100 },
          rowId: 'wr-a',
          creditedAmount: 100
        }),
        buildSummaryLogRowTransaction({
          number: 2,
          amount: 30,
          closingBalance: { amount: 70, availableAmount: 70 },
          rowId: 'wr-a',
          creditedAmount: 70
        })
      ])

      const lookup = await repository.findLatestCreditedAmountsByWasteRecords(
        'acc-1',
        [{ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-a' }]
      )

      expect(lookup({ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-a' })).toBe(
        70
      )
    })

    it('isolates lookups per (type, rowId) within an accreditation', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 100,
          closingBalance: { amount: 100, availableAmount: 100 },
          type: WASTE_RECORD_TYPE.RECEIVED,
          rowId: 'wr-a',
          creditedAmount: 100
        }),
        buildSummaryLogRowTransaction({
          number: 2,
          amount: 25,
          closingBalance: { amount: 125, availableAmount: 125 },
          type: WASTE_RECORD_TYPE.EXPORTED,
          rowId: 'wr-a',
          creditedAmount: 25
        })
      ])

      const lookup = await repository.findLatestCreditedAmountsByWasteRecords(
        'acc-1',
        [
          { type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-a' },
          { type: WASTE_RECORD_TYPE.EXPORTED, rowId: 'wr-a' }
        ]
      )

      expect(lookup({ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-a' })).toBe(
        100
      )
      expect(lookup({ type: WASTE_RECORD_TYPE.EXPORTED, rowId: 'wr-a' })).toBe(
        25
      )
    })

    it('isolates lookups per accreditation when the same (type, rowId) appears under both', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          accreditationId: 'acc-1',
          number: 1,
          amount: 100,
          closingBalance: { amount: 100, availableAmount: 100 },
          rowId: 'wr-shared',
          creditedAmount: 100
        }),
        buildSummaryLogRowTransaction({
          accreditationId: 'acc-2',
          number: 1,
          amount: 250,
          closingBalance: { amount: 250, availableAmount: 250 },
          rowId: 'wr-shared',
          creditedAmount: 250
        })
      ])

      const acc1 = await repository.findLatestCreditedAmountsByWasteRecords(
        'acc-1',
        [{ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-shared' }]
      )
      const acc2 = await repository.findLatestCreditedAmountsByWasteRecords(
        'acc-2',
        [{ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-shared' }]
      )

      expect(
        acc1({ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-shared' })
      ).toBe(100)
      expect(
        acc2({ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-shared' })
      ).toBe(250)
    })

    it('returns 0 for a waste record that exists only under another accreditation', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          accreditationId: 'acc-other',
          number: 1,
          amount: 999,
          closingBalance: { amount: 999, availableAmount: 999 },
          rowId: 'wr-shared',
          creditedAmount: 999
        })
      ])

      const lookup = await repository.findLatestCreditedAmountsByWasteRecords(
        'acc-1',
        [{ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-shared' }]
      )

      expect(
        lookup({ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-shared' })
      ).toBe(0)
    })

    it('does not include PRN-operation transactions in the lookup', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 60,
          closingBalance: { amount: 60, availableAmount: 60 },
          rowId: 'wr-a',
          creditedAmount: 60
        }),
        buildPrnOperationTransaction({ number: 2 })
      ])

      const lookup = await repository.findLatestCreditedAmountsByWasteRecords(
        'acc-1',
        [{ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-a' }]
      )

      expect(lookup({ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-a' })).toBe(
        60
      )
    })

    it('preserves high-precision creditedAmount exactly', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 200.005,
          closingBalance: { amount: 200.005, availableAmount: 200.005 },
          rowId: 'wr-precise',
          creditedAmount: 200.005
        }),
        buildSummaryLogRowTransaction({
          number: 2,
          amount: 100.001,
          closingBalance: { amount: 100.004, availableAmount: 100.004 },
          rowId: 'wr-precise',
          creditedAmount: 100.004
        })
      ])

      const lookup = await repository.findLatestCreditedAmountsByWasteRecords(
        'acc-1',
        [{ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-precise' }]
      )

      expect(
        lookup({ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-precise' })
      ).toBe(100.004)
    })

    it('skips stored transactions whose waste records are not in the input', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 100,
          closingBalance: { amount: 100, availableAmount: 100 },
          rowId: 'wr-requested',
          creditedAmount: 100
        }),
        buildSummaryLogRowTransaction({
          number: 2,
          amount: 999,
          closingBalance: { amount: 1099, availableAmount: 1099 },
          rowId: 'wr-not-asked-for',
          creditedAmount: 999
        })
      ])

      const lookup = await repository.findLatestCreditedAmountsByWasteRecords(
        'acc-1',
        [{ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-requested' }]
      )

      expect(
        lookup({ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-requested' })
      ).toBe(100)
      expect(
        lookup({ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-not-asked-for' })
      ).toBe(0)
    })

    it('returns the highest-numbered match regardless of insertion order', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 5,
          amount: 50,
          closingBalance: { amount: 250, availableAmount: 250 },
          rowId: 'wr-a',
          creditedAmount: 250
        })
      ])
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 2,
          amount: 100,
          closingBalance: { amount: 100, availableAmount: 100 },
          rowId: 'wr-a',
          creditedAmount: 100
        })
      ])

      const lookup = await repository.findLatestCreditedAmountsByWasteRecords(
        'acc-1',
        [{ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-a' }]
      )

      expect(lookup({ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-a' })).toBe(
        250
      )
    })

    it('deduplicates input records', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 10,
          closingBalance: { amount: 10, availableAmount: 10 },
          rowId: 'wr-a',
          creditedAmount: 10
        })
      ])

      const lookup = await repository.findLatestCreditedAmountsByWasteRecords(
        'acc-1',
        [
          { type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-a' },
          { type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-a' },
          { type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-a' }
        ]
      )

      expect(lookup({ type: WASTE_RECORD_TYPE.RECEIVED, rowId: 'wr-a' })).toBe(
        10
      )
    })
  })
}
