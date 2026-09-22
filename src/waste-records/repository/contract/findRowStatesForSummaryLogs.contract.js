import { describe, beforeEach, expect } from 'vitest'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID
} from '../test-data.js'

const OTHER_LEDGER = { ...DEFAULT_LEDGER_ID, registrationId: 'reg-2' }

export const testFindRowStatesForSummaryLogsBehaviour = (it) => {
  describe('findRowStatesForSummaryLogs', () => {
    let repository

    beforeEach((/** @type {*} */ { summaryLogRowStatesRepository }) => {
      repository = summaryLogRowStatesRepository()
    })

    it('returns an empty map when asked for no summary logs at all', async () => {
      const grouped = await repository.findRowStatesForSummaryLogs([])
      expect(grouped).toBeInstanceOf(Map)
      expect(grouped.size).toBe(0)
    })

    it('omits summary logs that have no row states', async () => {
      const grouped = await repository.findRowStatesForSummaryLogs([
        'unknown-log'
      ])
      expect(grouped.has('unknown-log')).toBe(false)
      expect(grouped.size).toBe(0)
    })

    it("groups each summary log's row states under its own id", async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({ rowId: 'row-1' }),
          buildSummaryLogRowStateEntry({ rowId: 'row-2' })
        ],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        OTHER_LEDGER,
        [buildSummaryLogRowStateEntry({ rowId: 'row-3' })],
        'log-2'
      )

      const grouped = await repository.findRowStatesForSummaryLogs([
        'log-1',
        'log-2'
      ])

      expect(grouped.size).toBe(2)
      expect(
        grouped
          .get('log-1')
          .map((state) => state.rowId)
          .sort()
      ).toEqual(['row-1', 'row-2'])
      expect(grouped.get('log-2').map((state) => state.rowId)).toEqual([
        'row-3'
      ])
    })

    it('preserves rowId and classification on each grouped document', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [buildSummaryLogRowStateEntry({ rowId: 'row-1' })],
        'log-1'
      )

      const grouped = await repository.findRowStatesForSummaryLogs(['log-1'])
      const [state] = grouped.get('log-1')
      expect(state.rowId).toBe('row-1')
      expect(state.classification).toEqual({
        outcome: ROW_OUTCOME.INCLUDED,
        reasons: [],
        transactionAmount: 10
      })
    })

    it('groups a document only under the queried ids in its membership', async () => {
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

      const grouped = await repository.findRowStatesForSummaryLogs(['log-2'])

      expect([...grouped.keys()]).toEqual(['log-2'])
      expect(grouped.get('log-2')).toHaveLength(1)
      expect(grouped.get('log-2')[0].summaryLogIds).toEqual(['log-1', 'log-2'])
    })
  })
}
