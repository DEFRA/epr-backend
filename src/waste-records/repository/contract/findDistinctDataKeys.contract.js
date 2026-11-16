import { describe, beforeEach, expect } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'

import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID,
  DEFAULT_YEAR,
  withNumbers
} from '../test-data.js'

export const testFindDistinctDataKeysBehaviour = (it) => {
  describe('findDistinctDataKeys', () => {
    let repository

    beforeEach((/** @type {*} */ { summaryLogRowStatesRepository }) => {
      repository = summaryLogRowStatesRepository()
    })

    it('returns an empty array when no row states exist', async () => {
      expect(await repository.findDistinctDataKeys(DEFAULT_YEAR)).toEqual([])
    })

    it('returns the union of data keys across every stored row state', async () => {
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
        withNumbers(DEFAULT_LEDGER_ID),
        [
          buildSummaryLogRowStateEntry({
            rowId: 'row-2',
            data: { BETA: 22, GAMMA: 'g' }
          })
        ],
        'log-1'
      )

      const result = await repository.findDistinctDataKeys(DEFAULT_YEAR)
      expect([...result].sort()).toEqual(['ALPHA', 'BETA', 'GAMMA'])
    })

    it('surfaces keys from superseded states, not just the latest submitted summary log', async () => {
      await repository.upsertSummaryLogRowStates(
        withNumbers(DEFAULT_LEDGER_ID),
        [
          buildSummaryLogRowStateEntry({
            rowId: 'row-1',
            data: { OLD_ONLY: 1 }
          })
        ],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        withNumbers(DEFAULT_LEDGER_ID),
        [
          buildSummaryLogRowStateEntry({
            rowId: 'row-1',
            data: { NEW_ONLY: 2 }
          })
        ],
        'log-2'
      )

      const result = await repository.findDistinctDataKeys(DEFAULT_YEAR)
      expect([...result].sort()).toEqual(['NEW_ONLY', 'OLD_ONLY'])
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

      expect(await repository.findDistinctDataKeys(DEFAULT_YEAR)).toEqual([
        'SHARED'
      ])
    })

    it('returns only the keys of the given year', async () => {
      await repository.upsertSummaryLogRowStates(
        withNumbers({ ...DEFAULT_LEDGER_ID, year: toYear(2026) }),
        [
          buildSummaryLogRowStateEntry({
            rowId: 'row-1',
            data: { ONLY_2026: 1 }
          })
        ],
        'log-2026'
      )
      await repository.upsertSummaryLogRowStates(
        withNumbers({ ...DEFAULT_LEDGER_ID, year: toYear(2027) }),
        [
          buildSummaryLogRowStateEntry({
            rowId: 'row-1',
            data: { ONLY_2027: 1 }
          })
        ],
        'log-2027'
      )

      expect(await repository.findDistinctDataKeys(toYear(2026))).toEqual([
        'ONLY_2026'
      ])
      expect(await repository.findDistinctDataKeys(toYear(2027))).toEqual([
        'ONLY_2027'
      ])
    })
  })
}
