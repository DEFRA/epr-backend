import { describe, beforeEach, expect } from 'vitest'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID
} from '../test-data.js'

export const testFindRowHistoryBehaviour = (it) => {
  describe('findRowHistory', () => {
    let repository

    beforeEach((/** @type {*} */ { summaryLogRowStateRepository }) => {
      repository = summaryLogRowStateRepository()
    })

    it('returns an empty list for a row that has never committed', async () => {
      expect(
        await repository.findRowHistory(
          'org-1',
          'reg-1',
          'row-1',
          WASTE_RECORD_TYPE.RECEIVED
        )
      ).toEqual([])
    })

    it('returns every committed state of a row in insertion order', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [buildSummaryLogRowStateEntry({ data: { tonnage: 1 } })],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [buildSummaryLogRowStateEntry({ data: { tonnage: 2 } })],
        'log-2'
      )
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [buildSummaryLogRowStateEntry({ data: { tonnage: 3 } })],
        'log-3'
      )

      const history = await repository.findRowHistory(
        'org-1',
        'reg-1',
        'row-1',
        WASTE_RECORD_TYPE.RECEIVED
      )
      expect(history.map((s) => s.data.tonnage)).toEqual([1, 2, 3])
    })

    it('isolates history to the requested row identity', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({ rowId: 'row-1' }),
          buildSummaryLogRowStateEntry({ rowId: 'row-2' })
        ],
        'log-1'
      )

      const history = await repository.findRowHistory(
        'org-1',
        'reg-1',
        'row-1',
        WASTE_RECORD_TYPE.RECEIVED
      )
      expect(history).toHaveLength(1)
      expect(history[0].rowId).toBe('row-1')
    })

    it('isolates history by waste-record type for the same rowId', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({
            wasteRecordType: WASTE_RECORD_TYPE.RECEIVED
          }),
          buildSummaryLogRowStateEntry({
            wasteRecordType: WASTE_RECORD_TYPE.PROCESSED
          })
        ],
        'log-1'
      )

      const received = await repository.findRowHistory(
        'org-1',
        'reg-1',
        'row-1',
        WASTE_RECORD_TYPE.RECEIVED
      )
      expect(received).toHaveLength(1)
      expect(received[0].wasteRecordType).toBe(WASTE_RECORD_TYPE.RECEIVED)
    })

    it('returns membership verbatim on each historical state', async () => {
      const stateA = buildSummaryLogRowStateEntry({ data: { tonnage: 10 } })
      const stateB = buildSummaryLogRowStateEntry({ data: { tonnage: 20 } })

      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [stateA],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [stateB],
        'log-2'
      )
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [stateA],
        'log-3'
      )

      const history = await repository.findRowHistory(
        'org-1',
        'reg-1',
        'row-1',
        WASTE_RECORD_TYPE.RECEIVED
      )
      expect(history.map((s) => s.summaryLogIds)).toEqual([
        ['log-1', 'log-3'],
        ['log-2']
      ])
    })
  })
}
