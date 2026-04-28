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

export const testFindTransactionsByRowBehaviour = (it) => {
  describe('findTransactionsByRow', () => {
    let repository

    beforeEach(async ({ ledgerRepository }) => {
      repository = await ledgerRepository()
    })

    it('returns an empty array when no transactions match', async () => {
      const result = await repository.findTransactionsByRow({
        summaryLogId: 'log-none',
        rowId: 'row-none',
        rowType: 'received'
      })
      expect(result).toEqual([])
    })

    it('returns matches ordered by number ascending', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          source: summaryLogRowSource({
            summaryLogId: 'log-A',
            rowId: 'row-X',
            rowType: 'received',
            wasteRecordVersionId: 'v1'
          })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 3,
          source: summaryLogRowSource({
            summaryLogId: 'log-A',
            rowId: 'row-X',
            rowType: 'received',
            wasteRecordVersionId: 'v3'
          })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 2,
          source: summaryLogRowSource({
            summaryLogId: 'log-A',
            rowId: 'row-X',
            rowType: 'received',
            wasteRecordVersionId: 'v2'
          })
        })
      ])

      const result = await repository.findTransactionsByRow({
        summaryLogId: 'log-A',
        rowId: 'row-X',
        rowType: 'received'
      })

      expect(result.map((t) => t.number)).toEqual([1, 2, 3])
    })

    it('matches on the full (summaryLogId, rowId, rowType) key', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          source: summaryLogRowSource({
            summaryLogId: 'log-A',
            rowId: 'shared-row-id',
            rowType: 'received'
          })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 2,
          source: summaryLogRowSource({
            summaryLogId: 'log-B',
            rowId: 'shared-row-id',
            rowType: 'received'
          })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 3,
          source: summaryLogRowSource({
            summaryLogId: 'log-A',
            rowId: 'shared-row-id',
            rowType: 'sentOn'
          })
        })
      ])

      const result = await repository.findTransactionsByRow({
        summaryLogId: 'log-A',
        rowId: 'shared-row-id',
        rowType: 'received'
      })

      expect(result).toHaveLength(1)
      expect(result[0].source.summaryLogRow.summaryLogId).toBe('log-A')
      expect(result[0].source.summaryLogRow.rowType).toBe('received')
    })
  })
}
