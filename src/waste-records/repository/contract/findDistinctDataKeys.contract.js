import { describe, beforeEach, expect } from 'vitest'

import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID,
  withNumbers
} from '../test-data.js'

export const testFindDistinctDataKeysBehaviour = (it) => {
  describe('findDistinctDataKeys', () => {
    let repository

    beforeEach((/** @type {*} */ { summaryLogRowStatesRepository }) => {
      repository = summaryLogRowStatesRepository()
    })

    it('returns an empty array when no row states exist', async () => {
      expect(await repository.findDistinctDataKeys(['log-1'])).toEqual([])
    })

    it('returns an empty array when asked for no summary logs', async () => {
      await repository.upsertSummaryLogRowStates(
        withNumbers(DEFAULT_LEDGER_ID),
        [buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { ALPHA: 1 } })],
        'log-1'
      )

      expect(await repository.findDistinctDataKeys([])).toEqual([])
    })

    it('returns the union of data keys across the row states of the given summary logs', async () => {
      await repository.upsertSummaryLogRowStates(
        withNumbers(DEFAULT_LEDGER_ID),
        [
          buildSummaryLogRowStateEntry({
            rowId: 'row-1',
            data: { ALPHA: 1, BETA: 2 }
          })
        ],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        withNumbers({ ...DEFAULT_LEDGER_ID, registrationId: 'reg-2' }),
        [
          buildSummaryLogRowStateEntry({
            rowId: 'row-2',
            data: { BETA: 22, GAMMA: 'g' }
          })
        ],
        'log-2'
      )

      const result = await repository.findDistinctDataKeys(['log-1', 'log-2'])
      expect([...result].sort()).toEqual(['ALPHA', 'BETA', 'GAMMA'])
    })

    it('ignores row states of summary logs not asked for', async () => {
      await repository.upsertSummaryLogRowStates(
        withNumbers(DEFAULT_LEDGER_ID),
        [buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { ASKED: 1 } })],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        withNumbers(DEFAULT_LEDGER_ID),
        [
          buildSummaryLogRowStateEntry({
            rowId: 'row-2',
            data: { NOT_ASKED: 1 }
          })
        ],
        'log-2'
      )

      expect(await repository.findDistinctDataKeys(['log-1'])).toEqual([
        'ASKED'
      ])
    })

    it('includes a state shared with a summary log not asked for', async () => {
      const entry = buildSummaryLogRowStateEntry({
        rowId: 'row-1',
        data: { SHARED_STATE: 1 }
      })
      await repository.upsertSummaryLogRowStates(
        withNumbers(DEFAULT_LEDGER_ID),
        [entry],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        withNumbers(DEFAULT_LEDGER_ID),
        [entry],
        'log-2'
      )

      expect(await repository.findDistinctDataKeys(['log-2'])).toEqual([
        'SHARED_STATE'
      ])
    })

    it('deduplicates keys that appear on multiple states', async () => {
      await repository.upsertSummaryLogRowStates(
        withNumbers(DEFAULT_LEDGER_ID),
        [
          buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { SHARED: 1 } }),
          buildSummaryLogRowStateEntry({ rowId: 'row-2', data: { SHARED: 2 } })
        ],
        'log-1'
      )

      expect(await repository.findDistinctDataKeys(['log-1'])).toEqual([
        'SHARED'
      ])
    })
  })
}
