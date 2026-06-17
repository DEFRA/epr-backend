import { describe, beforeEach, expect } from 'vitest'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

import {
  buildRowStateEntry,
  DEFAULT_PARTITION
} from '../row-states-test-data.js'

export const testFindRowHistoryBehaviour = (it) => {
  describe('findRowHistory', () => {
    let repository

    beforeEach((/** @type {*} */ { rowStateRepository }) => {
      repository = rowStateRepository()
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
      await repository.upsertRowStates(
        DEFAULT_PARTITION,
        [buildRowStateEntry({ data: { tonnage: 1 } })],
        'log-1'
      )
      await repository.upsertRowStates(
        DEFAULT_PARTITION,
        [buildRowStateEntry({ data: { tonnage: 2 } })],
        'log-2'
      )
      await repository.upsertRowStates(
        DEFAULT_PARTITION,
        [buildRowStateEntry({ data: { tonnage: 3 } })],
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
      await repository.upsertRowStates(
        DEFAULT_PARTITION,
        [
          buildRowStateEntry({ rowId: 'row-1' }),
          buildRowStateEntry({ rowId: 'row-2' })
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
      await repository.upsertRowStates(
        DEFAULT_PARTITION,
        [
          buildRowStateEntry({ wasteRecordType: WASTE_RECORD_TYPE.RECEIVED }),
          buildRowStateEntry({ wasteRecordType: WASTE_RECORD_TYPE.PROCESSED })
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
      const stateA = buildRowStateEntry({ data: { tonnage: 10 } })
      const stateB = buildRowStateEntry({ data: { tonnage: 20 } })

      await repository.upsertRowStates(DEFAULT_PARTITION, [stateA], 'log-1')
      await repository.upsertRowStates(DEFAULT_PARTITION, [stateB], 'log-2')
      await repository.upsertRowStates(DEFAULT_PARTITION, [stateA], 'log-3')

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
