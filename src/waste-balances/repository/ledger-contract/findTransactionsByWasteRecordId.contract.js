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

export const testFindTransactionsByWasteRecordIdBehaviour = (it) => {
  describe('findTransactionsByWasteRecordId', () => {
    let repository

    beforeEach(async ({ ledgerRepository }) => {
      repository = await ledgerRepository()
    })

    it('returns an empty array when no transactions match', async () => {
      const result =
        await repository.findTransactionsByWasteRecordId('waste-record-none')
      expect(result).toEqual([])
    })

    it('returns full version history ordered by number ascending', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          source: summaryLogRowSource({
            wasteRecordId: 'wr-X',
            wasteRecordVersionId: 'v1'
          })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 3,
          source: summaryLogRowSource({
            wasteRecordId: 'wr-X',
            wasteRecordVersionId: 'v3'
          })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 2,
          source: summaryLogRowSource({
            wasteRecordId: 'wr-X',
            wasteRecordVersionId: 'v2'
          })
        })
      ])

      const result = await repository.findTransactionsByWasteRecordId('wr-X')

      expect(result.map((t) => t.number)).toEqual([1, 2, 3])
      expect(
        result.map((t) => t.source.summaryLogRow.wasteRecordVersionId)
      ).toEqual(['v1', 'v2', 'v3'])
    })

    it('isolates results by waste record id', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          source: summaryLogRowSource({ wasteRecordId: 'wr-A' })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 2,
          source: summaryLogRowSource({ wasteRecordId: 'wr-B' })
        })
      ])

      const a = await repository.findTransactionsByWasteRecordId('wr-A')
      const b = await repository.findTransactionsByWasteRecordId('wr-B')

      expect(a).toHaveLength(1)
      expect(a[0].source.summaryLogRow.wasteRecordId).toBe('wr-A')
      expect(b).toHaveLength(1)
      expect(b[0].source.summaryLogRow.wasteRecordId).toBe('wr-B')
    })

    it('does not include PRN-operation transactions', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          source: summaryLogRowSource({ wasteRecordId: 'wr-X' })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 2,
          source: {
            kind: 'prn-operation',
            prnOperation: { prnId: 'prn-1', operationType: 'creation' }
          }
        })
      ])

      const result = await repository.findTransactionsByWasteRecordId('wr-X')
      expect(result).toHaveLength(1)
    })
  })
}
