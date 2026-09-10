import { describe, beforeEach, expect } from 'vitest'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID
} from '../test-data.js'

const REGISTERED_ONLY = { ...DEFAULT_LEDGER_ID, accreditationId: null }

const collect = async (rowStates) => {
  const collected = []
  for await (const rowState of rowStates) {
    collected.push(rowState)
  }
  return collected
}

export const testStreamRowStatesForSummaryLogsBehaviour = (it) => {
  describe('streamRowStatesForSummaryLogs', () => {
    let repository

    beforeEach((/** @type {*} */ { summaryLogRowStatesRepository }) => {
      repository = summaryLogRowStatesRepository()
    })

    it('yields nothing for summary logs with no row states', async () => {
      expect(
        await collect(repository.streamRowStatesForSummaryLogs(['unknown-log']))
      ).toEqual([])
    })

    it('yields nothing when asked for no summary logs at all', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [buildSummaryLogRowStateEntry()],
        'log-1'
      )

      expect(
        await collect(repository.streamRowStatesForSummaryLogs([]))
      ).toEqual([])
    })

    it('yields the ledger identity, the membership and the row as submitted, and nothing else', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({
            wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
            processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
            data: { tonnage: 7 }
          })
        ],
        'log-1'
      )

      expect(
        await collect(repository.streamRowStatesForSummaryLogs(['log-1']))
      ).toEqual([
        {
          ...DEFAULT_LEDGER_ID,
          summaryLogIds: ['log-1'],
          wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
          data: { tonnage: 7 }
        }
      ])
    })

    it('yields the union across every summary log asked for', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [buildSummaryLogRowStateEntry({ rowId: 'row-1' })],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        { ...DEFAULT_LEDGER_ID, registrationId: 'reg-2' },
        [buildSummaryLogRowStateEntry({ rowId: 'row-2' })],
        'log-2'
      )
      await repository.upsertSummaryLogRowStates(
        { ...DEFAULT_LEDGER_ID, registrationId: 'reg-3' },
        [buildSummaryLogRowStateEntry({ rowId: 'row-3' })],
        'log-3'
      )

      const yielded = await collect(
        repository.streamRowStatesForSummaryLogs(['log-1', 'log-3'])
      )

      expect(yielded.map((rowState) => rowState.registrationId).sort()).toEqual(
        ['reg-1', 'reg-3']
      )
    })

    it('yields a row state only once however many of the asked-for logs share it', async () => {
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

      const yielded = await collect(
        repository.streamRowStatesForSummaryLogs(['log-1', 'log-2'])
      )

      expect(yielded).toHaveLength(1)
      expect(yielded[0].summaryLogIds).toEqual(['log-1', 'log-2'])
    })

    it('yields a row of a submission it was not asked for, when a later one shares its membership query', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { tonnage: 1 } })
        ],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { tonnage: 2 } })
        ],
        'log-2'
      )

      const yielded = await collect(
        repository.streamRowStatesForSummaryLogs(['log-1', 'log-2'])
      )

      expect(yielded.map((rowState) => rowState.summaryLogIds).sort()).toEqual([
        ['log-1'],
        ['log-2']
      ])
    })

    it('yields every ledger that shares a summary log id, leaving the caller to narrow', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [buildSummaryLogRowStateEntry()],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        REGISTERED_ONLY,
        [buildSummaryLogRowStateEntry()],
        'log-1'
      )

      const yielded = await collect(
        repository.streamRowStatesForSummaryLogs(['log-1'])
      )

      expect(yielded).toHaveLength(2)
      expect(
        yielded.map((rowState) => rowState.accreditationId).sort()
      ).toEqual(['acc-1', null])
    })
  })
}
