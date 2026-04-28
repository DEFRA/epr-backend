import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerTransaction } from '../ledger-test-data.js'

const prnOperationSource = (overrides = {}) => ({
  kind: 'prn-operation',
  prnOperation: {
    prnId: 'prn-1',
    operationType: 'creation',
    ...overrides
  }
})

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

export const testFindTransactionsByPrnIdBehaviour = (it) => {
  describe('findTransactionsByPrnId', () => {
    let repository

    beforeEach(async ({ ledgerRepository }) => {
      repository = await ledgerRepository()
    })

    it('returns an empty array when no transactions match', async () => {
      const result = await repository.findTransactionsByPrnId('prn-none')
      expect(result).toEqual([])
    })

    it('returns the full lifecycle ordered by number ascending', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          source: prnOperationSource({
            prnId: 'prn-X',
            operationType: 'creation'
          })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 3,
          source: prnOperationSource({
            prnId: 'prn-X',
            operationType: 'acceptance'
          })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 2,
          source: prnOperationSource({
            prnId: 'prn-X',
            operationType: 'issuance'
          })
        })
      ])

      const result = await repository.findTransactionsByPrnId('prn-X')

      expect(result.map((t) => t.number)).toEqual([1, 2, 3])
      expect(result.map((t) => t.source.prnOperation.operationType)).toEqual([
        'creation',
        'issuance',
        'acceptance'
      ])
    })

    it('isolates results by prn id', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          source: prnOperationSource({ prnId: 'prn-A' })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 2,
          source: prnOperationSource({ prnId: 'prn-B' })
        })
      ])

      const a = await repository.findTransactionsByPrnId('prn-A')
      const b = await repository.findTransactionsByPrnId('prn-B')

      expect(a).toHaveLength(1)
      expect(a[0].source.prnOperation.prnId).toBe('prn-A')
      expect(b).toHaveLength(1)
      expect(b[0].source.prnOperation.prnId).toBe('prn-B')
    })

    it('does not include summary-log-row transactions', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 1,
          source: prnOperationSource({ prnId: 'prn-X' })
        }),
        buildLedgerTransaction({
          accreditationId: 'acc-1',
          number: 2,
          source: summaryLogRowSource()
        })
      ])

      const result = await repository.findTransactionsByPrnId('prn-X')
      expect(result).toHaveLength(1)
      expect(result[0].source.kind).toBe('prn-operation')
    })
  })
}
