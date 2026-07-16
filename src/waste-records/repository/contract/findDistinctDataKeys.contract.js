import { describe, beforeEach, expect } from 'vitest'

import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID
} from '../test-data.js'

export const testFindDistinctDataKeysBehaviour = (it) => {
  describe('findDistinctDataKeys', () => {
    let repository

    beforeEach((/** @type {*} */ { summaryLogRowStateRepository }) => {
      repository = summaryLogRowStateRepository()
    })

    it('returns an empty array when no row states exist', async () => {
      expect(await repository.findDistinctDataKeys()).toEqual([])
    })

    it('returns the union of data keys across every stored row state', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({
            rowId: 'row-1',
            data: { ALPHA: 1, BETA: 2 }
          })
        ],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({
            rowId: 'row-2',
            data: { BETA: 22, GAMMA: 'g' }
          })
        ],
        'log-1'
      )

      const result = await repository.findDistinctDataKeys()
      expect([...result].sort()).toEqual(['ALPHA', 'BETA', 'GAMMA'])
    })

    it('surfaces keys from superseded states, not just the latest submitted summary log', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({
            rowId: 'row-1',
            data: { OLD_ONLY: 1 }
          })
        ],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({
            rowId: 'row-1',
            data: { NEW_ONLY: 2 }
          })
        ],
        'log-2'
      )

      const result = await repository.findDistinctDataKeys()
      expect([...result].sort()).toEqual(['NEW_ONLY', 'OLD_ONLY'])
    })

    it('deduplicates keys that appear on multiple states', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { SHARED: 1 } }),
          buildSummaryLogRowStateEntry({ rowId: 'row-2', data: { SHARED: 2 } })
        ],
        'log-1'
      )

      expect(await repository.findDistinctDataKeys()).toEqual(['SHARED'])
    })
  })
}
