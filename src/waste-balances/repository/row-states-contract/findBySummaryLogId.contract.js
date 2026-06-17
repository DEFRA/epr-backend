import { describe, beforeEach, expect } from 'vitest'

import {
  buildRowStateEntry,
  DEFAULT_PARTITION
} from '../row-states-test-data.js'

export const testFindBySummaryLogIdBehaviour = (it) => {
  describe('findBySummaryLogId', () => {
    let repository

    beforeEach((/** @type {*} */ { rowStateRepository }) => {
      repository = rowStateRepository()
    })

    it('returns an empty list for a submission with no committed rows', async () => {
      expect(await repository.findBySummaryLogId('unknown-log')).toEqual([])
    })

    it('returns only documents whose membership contains the id', async () => {
      await repository.upsertRowStates(
        DEFAULT_PARTITION,
        [
          buildRowStateEntry({ rowId: 'row-1' }),
          buildRowStateEntry({ rowId: 'row-2' })
        ],
        'log-1'
      )
      await repository.upsertRowStates(
        DEFAULT_PARTITION,
        [buildRowStateEntry({ rowId: 'row-1', data: { tonnage: 99 } })],
        'log-2'
      )

      const atLog2 = await repository.findBySummaryLogId('log-2')
      expect(atLog2).toHaveLength(1)
      expect(atLog2[0].rowId).toBe('row-1')
      expect(atLog2[0].data).toEqual({ tonnage: 99 })
    })

    it('returns the full committed state of a submission', async () => {
      await repository.upsertRowStates(
        DEFAULT_PARTITION,
        [
          buildRowStateEntry({ rowId: 'row-1' }),
          buildRowStateEntry({ rowId: 'row-2' }),
          buildRowStateEntry({ rowId: 'row-3' })
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
      const entry = buildRowStateEntry()

      await repository.upsertRowStates(DEFAULT_PARTITION, [entry], 'log-1')
      await repository.upsertRowStates(DEFAULT_PARTITION, [entry], 'log-2')
      await repository.upsertRowStates(DEFAULT_PARTITION, [entry], 'log-3')

      const [doc] = await repository.findBySummaryLogId('log-2')
      expect(doc.summaryLogIds).toEqual(['log-1', 'log-2', 'log-3'])
    })
  })
}
