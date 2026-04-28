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

export const testFindTransactionsBySummaryLogIdBehaviour = (it) => {
  describe('findTransactionsBySummaryLogId', () => {
    let repository

    beforeEach(async ({ ledgerRepository }) => {
      repository = await ledgerRepository()
    })

    it('returns an empty array when no transactions match', async () => {
      const result =
        await repository.findTransactionsBySummaryLogId('log-empty')
      expect(result).toEqual([])
    })

    it('returns transactions matching the summary log id, ordered by number ascending', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          source: summaryLogRowSource({ summaryLogId: 'log-A', rowId: 'r1' })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 3,
          source: summaryLogRowSource({ summaryLogId: 'log-A', rowId: 'r3' })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 2,
          source: summaryLogRowSource({ summaryLogId: 'log-A', rowId: 'r2' })
        })
      ])

      const result = await repository.findTransactionsBySummaryLogId('log-A')

      expect(result.map((t) => t.number)).toEqual([1, 2, 3])
      expect(result.map((t) => t.source.summaryLogRow.rowId)).toEqual([
        'r1',
        'r2',
        'r3'
      ])
    })

    it('does not include transactions from other summary logs', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          source: summaryLogRowSource({ summaryLogId: 'log-A' })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 2,
          source: summaryLogRowSource({ summaryLogId: 'log-B' })
        })
      ])

      const result = await repository.findTransactionsBySummaryLogId('log-A')
      expect(result).toHaveLength(1)
      expect(result[0].source.summaryLogRow.summaryLogId).toBe('log-A')
    })

    it('does not include PRN-operation transactions', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          source: summaryLogRowSource({ summaryLogId: 'log-A' })
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

      const result = await repository.findTransactionsBySummaryLogId('log-A')
      expect(result).toHaveLength(1)
      expect(result[0].source.kind).toBe('summary-log-row')
    })
  })
}
