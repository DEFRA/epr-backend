import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerTransaction } from '../ledger-test-data.js'

const summaryLogRowSource = (overrides = {}) => ({
  kind: 'summary-log-row',
  summaryLogRow: {
    summaryLogId: 'log-1',
    rowId: 'row-1',
    rowType: 'received',
    wasteRecordId: 'waste-record-1',
    wasteRecordVersionId: 'version-1',
    ...overrides
  }
})

export const testFindCreditedAmountsByWasteRecordIdsBehaviour = (it) => {
  describe('findCreditedAmountsByWasteRecordIds', () => {
    let repository

    beforeEach(async ({ ledgerRepository }) => {
      repository = await ledgerRepository()
    })

    it('returns an empty map for an empty input', async () => {
      const result = await repository.findCreditedAmountsByWasteRecordIds([])
      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(0)
    })

    it('returns 0 for waste records with no transactions', async () => {
      const result = await repository.findCreditedAmountsByWasteRecordIds([
        'wr-missing'
      ])
      expect(result.get('wr-missing')).toBe(0)
    })

    it('returns the amount of a single credit transaction', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          type: 'credit',
          amount: 100,
          source: summaryLogRowSource({ wasteRecordId: 'wr-X' })
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds([
        'wr-X'
      ])
      expect(result.get('wr-X')).toBe(100)
    })

    it('returns the negation of a single debit transaction', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          type: 'debit',
          amount: 30,
          source: summaryLogRowSource({ wasteRecordId: 'wr-Y' })
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds([
        'wr-Y'
      ])
      expect(result.get('wr-Y')).toBe(-30)
    })

    it('returns the signed sum across multiple transactions for the same waste record', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          type: 'credit',
          amount: 100,
          source: summaryLogRowSource({
            wasteRecordId: 'wr-multi',
            wasteRecordVersionId: 'v1'
          })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 2,
          type: 'debit',
          amount: 30,
          source: summaryLogRowSource({
            wasteRecordId: 'wr-multi',
            wasteRecordVersionId: 'v2'
          })
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds([
        'wr-multi'
      ])
      expect(result.get('wr-multi')).toBe(70)
    })

    it('returns 0 when credits and debits cancel out (re-upload of identical data)', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          type: 'credit',
          amount: 50,
          source: summaryLogRowSource({
            wasteRecordId: 'wr-cancelling',
            wasteRecordVersionId: 'v1'
          })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 2,
          type: 'debit',
          amount: 50,
          source: summaryLogRowSource({
            wasteRecordId: 'wr-cancelling',
            wasteRecordVersionId: 'v2'
          })
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds([
        'wr-cancelling'
      ])
      expect(result.get('wr-cancelling')).toBe(0)
    })

    it('returns a map keyed by waste record id for a bulk query', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          type: 'credit',
          amount: 100,
          source: summaryLogRowSource({ wasteRecordId: 'wr-A' })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 2,
          type: 'credit',
          amount: 200,
          source: summaryLogRowSource({
            wasteRecordId: 'wr-B',
            wasteRecordVersionId: 'v-B'
          })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 3,
          type: 'debit',
          amount: 50,
          source: summaryLogRowSource({
            wasteRecordId: 'wr-A',
            wasteRecordVersionId: 'v-A2'
          })
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds([
        'wr-A',
        'wr-B',
        'wr-C'
      ])

      expect(result.get('wr-A')).toBe(50)
      expect(result.get('wr-B')).toBe(200)
      expect(result.get('wr-C')).toBe(0)
    })

    it('skips waste records whose id is not in the query set', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          type: 'credit',
          amount: 100,
          source: summaryLogRowSource({ wasteRecordId: 'wr-included' })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 2,
          type: 'credit',
          amount: 200,
          source: summaryLogRowSource({
            wasteRecordId: 'wr-other',
            wasteRecordVersionId: 'v-other'
          })
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds([
        'wr-included'
      ])

      expect(result.size).toBe(1)
      expect(result.get('wr-included')).toBe(100)
    })

    it('contributes 0 for transactions whose type is neither credit nor debit', async () => {
      // Pathological input: pending_debit with a summary-log-row source. The
      // schema permits the combination even though writers never produce it;
      // the port contract is to ignore non-credit/non-debit contributions.
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          type: 'pending_debit',
          amount: 25,
          source: summaryLogRowSource({ wasteRecordId: 'wr-pathological' })
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds([
        'wr-pathological'
      ])
      expect(result.get('wr-pathological')).toBe(0)
    })

    it('does not include amounts from PRN-operation transactions', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          type: 'credit',
          amount: 100,
          source: summaryLogRowSource({ wasteRecordId: 'wr-X' })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 2,
          type: 'pending_debit',
          amount: 25,
          source: {
            kind: 'prn-operation',
            prnOperation: { prnId: 'prn-1', operationType: 'issuance' }
          }
        })
      ])

      const result = await repository.findCreditedAmountsByWasteRecordIds([
        'wr-X'
      ])
      expect(result.get('wr-X')).toBe(100)
    })
  })
}
