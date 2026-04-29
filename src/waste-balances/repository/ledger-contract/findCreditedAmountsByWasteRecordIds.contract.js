import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerTransaction } from '../ledger-test-data.js'
import {
  LEDGER_SOURCE_KIND,
  LEDGER_TRANSACTION_TYPE
} from '../ledger-schema.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

const buildSummaryLogRowTransaction = ({
  accreditationId = 'acc-1',
  number,
  type = LEDGER_TRANSACTION_TYPE.CREDIT,
  amount,
  closingBalance,
  wasteRecordId,
  rowId = 'row-1',
  rowType = WASTE_RECORD_TYPE.RECEIVED
}) =>
  buildLedgerTransaction({
    accreditationId,
    number,
    type,
    amount,
    closingBalance,
    source: {
      kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
      summaryLogRow: {
        summaryLogId: 'log-1',
        rowId,
        rowType,
        wasteRecordId,
        wasteRecordVersionId: `version-${number}`
      }
    }
  })

const buildPrnOperationTransaction = ({ accreditationId = 'acc-1', number }) =>
  buildLedgerTransaction({
    accreditationId,
    number,
    type: LEDGER_TRANSACTION_TYPE.PENDING_DEBIT,
    source: {
      kind: 'prn-operation',
      prnOperation: { prnId: 'prn-1', operationType: 'creation' }
    }
  })

export const testFindCreditedAmountsByWasteRecordIdsBehaviour = (it) => {
  describe('findCreditedAmountsByWasteRecordIds', () => {
    let repository

    beforeEach(async ({ ledgerRepository }) => {
      repository = await ledgerRepository()
    })

    it('returns an empty map for an empty input', async () => {
      const result = await repository.findCreditedAmountsByWasteRecordIds(
        'acc-1',
        []
      )
      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(0)
    })

    it('returns 0 for waste record ids with no transactions', async () => {
      const result = await repository.findCreditedAmountsByWasteRecordIds(
        'acc-1',
        ['never-touched']
      )
      expect(result.size).toBe(1)
      expect(result.get('never-touched')).toBe(0)
    })

    it('sums a single credit', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 100,
          closingBalance: { amount: 100, availableAmount: 100 },
          wasteRecordId: 'wr-a'
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds(
        'acc-1',
        ['wr-a']
      )

      expect(result.get('wr-a')).toBe(100)
    })

    it('sums credits and subtracts debits for the same waste record id', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 100,
          closingBalance: { amount: 100, availableAmount: 100 },
          wasteRecordId: 'wr-a'
        }),
        buildSummaryLogRowTransaction({
          number: 2,
          type: LEDGER_TRANSACTION_TYPE.DEBIT,
          amount: 30,
          closingBalance: { amount: 70, availableAmount: 70 },
          wasteRecordId: 'wr-a'
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds(
        'acc-1',
        ['wr-a']
      )

      expect(result.get('wr-a')).toBe(70)
    })

    it('returns 0 when credits and debits cancel out', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 50,
          closingBalance: { amount: 50, availableAmount: 50 },
          wasteRecordId: 'wr-a'
        }),
        buildSummaryLogRowTransaction({
          number: 2,
          type: LEDGER_TRANSACTION_TYPE.DEBIT,
          amount: 50,
          closingBalance: { amount: 0, availableAmount: 0 },
          wasteRecordId: 'wr-a'
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds(
        'acc-1',
        ['wr-a']
      )

      expect(result.get('wr-a')).toBe(0)
    })

    it('isolates totals per waste record id within an accreditation', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 100,
          closingBalance: { amount: 100, availableAmount: 100 },
          wasteRecordId: 'wr-a'
        }),
        buildSummaryLogRowTransaction({
          number: 2,
          amount: 25,
          closingBalance: { amount: 125, availableAmount: 125 },
          wasteRecordId: 'wr-b'
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds(
        'acc-1',
        ['wr-a', 'wr-b']
      )

      expect(result.get('wr-a')).toBe(100)
      expect(result.get('wr-b')).toBe(25)
    })

    it('isolates totals per accreditation when the same waste record id appears under both', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          accreditationId: 'acc-1',
          number: 1,
          amount: 100,
          closingBalance: { amount: 100, availableAmount: 100 },
          wasteRecordId: 'wr-shared'
        }),
        buildSummaryLogRowTransaction({
          accreditationId: 'acc-2',
          number: 1,
          amount: 250,
          closingBalance: { amount: 250, availableAmount: 250 },
          wasteRecordId: 'wr-shared'
        })
      ])

      const acc1 = await repository.findCreditedAmountsByWasteRecordIds(
        'acc-1',
        ['wr-shared']
      )
      const acc2 = await repository.findCreditedAmountsByWasteRecordIds(
        'acc-2',
        ['wr-shared']
      )

      expect(acc1.get('wr-shared')).toBe(100)
      expect(acc2.get('wr-shared')).toBe(250)
    })

    it('returns 0 for a waste record id that exists only under another accreditation', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          accreditationId: 'acc-other',
          number: 1,
          amount: 999,
          closingBalance: { amount: 999, availableAmount: 999 },
          wasteRecordId: 'wr-shared'
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds(
        'acc-1',
        ['wr-shared']
      )

      expect(result.get('wr-shared')).toBe(0)
    })

    it('ignores stored transactions for waste record ids not in the input', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 100,
          closingBalance: { amount: 100, availableAmount: 100 },
          wasteRecordId: 'wr-requested'
        }),
        buildSummaryLogRowTransaction({
          number: 2,
          amount: 999,
          closingBalance: { amount: 1099, availableAmount: 1099 },
          wasteRecordId: 'wr-not-asked-for'
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds(
        'acc-1',
        ['wr-requested']
      )

      expect(result.size).toBe(1)
      expect(result.get('wr-requested')).toBe(100)
      expect(result.has('wr-not-asked-for')).toBe(false)
    })

    it('returns entries for every requested id (zero-fills missing ids)', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 5,
          closingBalance: { amount: 5, availableAmount: 5 },
          wasteRecordId: 'wr-a'
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds(
        'acc-1',
        ['wr-a', 'wr-missing']
      )

      expect(result.size).toBe(2)
      expect(result.get('wr-a')).toBe(5)
      expect(result.get('wr-missing')).toBe(0)
    })

    it('only includes summary-log-row transactions; PRN operations do not contribute', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 60,
          closingBalance: { amount: 60, availableAmount: 60 },
          wasteRecordId: 'wr-a'
        }),
        buildPrnOperationTransaction({ number: 2 })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds(
        'acc-1',
        ['wr-a']
      )

      expect(result.get('wr-a')).toBe(60)
    })

    it('excludes pending debits — they ringfence balance, not waste-record credits', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 100,
          closingBalance: { amount: 100, availableAmount: 100 },
          wasteRecordId: 'wr-a'
        }),
        buildSummaryLogRowTransaction({
          number: 2,
          type: LEDGER_TRANSACTION_TYPE.PENDING_DEBIT,
          amount: 40,
          closingBalance: { amount: 100, availableAmount: 60 },
          wasteRecordId: 'wr-a'
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds(
        'acc-1',
        ['wr-a']
      )

      expect(result.get('wr-a')).toBe(100)
    })

    it('preserves high-precision amounts exactly', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 200.005,
          closingBalance: { amount: 200.005, availableAmount: 200.005 },
          wasteRecordId: 'wr-precise'
        }),
        buildSummaryLogRowTransaction({
          number: 2,
          type: LEDGER_TRANSACTION_TYPE.DEBIT,
          amount: 100.001,
          closingBalance: { amount: 100.004, availableAmount: 100.004 },
          wasteRecordId: 'wr-precise'
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds(
        'acc-1',
        ['wr-precise']
      )

      expect(result.get('wr-precise')).toBe(100.004)
    })

    it('deduplicates input ids', async () => {
      await repository.insertTransactions([
        buildSummaryLogRowTransaction({
          number: 1,
          amount: 10,
          closingBalance: { amount: 10, availableAmount: 10 },
          wasteRecordId: 'wr-a'
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds(
        'acc-1',
        ['wr-a', 'wr-a', 'wr-a']
      )

      expect(result.size).toBe(1)
      expect(result.get('wr-a')).toBe(10)
    })
  })
}
