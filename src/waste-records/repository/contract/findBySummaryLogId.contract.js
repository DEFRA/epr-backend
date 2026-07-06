import { describe, beforeEach, expect } from 'vitest'

import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID
} from '../test-data.js'

export const testFindBySummaryLogIdBehaviour = (it) => {
  describe('findBySummaryLogId', () => {
    let repository

    beforeEach((/** @type {*} */ { summaryLogRowStateRepository }) => {
      repository = summaryLogRowStateRepository()
    })

    it('returns an empty list for a submission with no committed rows', async () => {
      expect(await repository.findBySummaryLogId('unknown-log')).toEqual([])
    })

    it('returns only documents whose membership contains the id', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({ rowId: 'row-1' }),
          buildSummaryLogRowStateEntry({ rowId: 'row-2' })
        ],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({
            rowId: 'row-1',
            data: { tonnage: 99 }
          })
        ],
        'log-2'
      )

      const atLog2 = await repository.findBySummaryLogId('log-2')
      expect(atLog2).toHaveLength(1)
      expect(atLog2[0].rowId).toBe('row-1')
      expect(atLog2[0].data).toEqual({ tonnage: 99 })
    })

    it('returns the full committed state of a submission', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({ rowId: 'row-1' }),
          buildSummaryLogRowStateEntry({ rowId: 'row-2' }),
          buildSummaryLogRowStateEntry({ rowId: 'row-3' })
        ],
        'log-1'
      )

      const committed = await repository.findBySummaryLogId('log-1')
      expect(committed.map((s) => s.rowId).sort()).toEqual([
        'row-1',
        'row-2',
        'row-3'
      ])
    })

    it('returns the full membership verbatim on each document', async () => {
      const entry = buildSummaryLogRowStateEntry()

      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [entry],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [entry],
        'log-2'
      )
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [entry],
        'log-3'
      )

      const [doc] = await repository.findBySummaryLogId('log-2')
      expect(doc.summaryLogIds).toEqual(['log-1', 'log-2', 'log-3'])
    })
  })
}
