import { describe, beforeEach, expect } from 'vitest'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID
} from '../test-data.js'

const SEPTEMBER = {
  dateFields: ['DATE_RECEIVED', 'DATE_EXPORTED'],
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  undated: {
    wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
    dateField: 'DATE_RECEIVED'
  }
}

const THIRD_QUARTER = {
  ...SEPTEMBER,
  startDate: '2026-07-01',
  endDate: '2026-09-30'
}

const DECEMBER = {
  ...SEPTEMBER,
  startDate: '2026-12-01',
  endDate: '2026-12-31'
}

export const testFindWasteRecordStatesInPeriodBehaviour = (it) => {
  describe('findWasteRecordStatesInPeriod', () => {
    let repository

    beforeEach((/** @type {*} */ { summaryLogRowStatesRepository }) => {
      repository = summaryLogRowStatesRepository()
    })

    const commit = (rows) =>
      repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        rows.map(([rowId, data, overrides]) =>
          buildSummaryLogRowStateEntry({ rowId, data, ...overrides })
        ),
        'log-1'
      )

    const rowIdsIn = async (period) =>
      (
        await repository.findWasteRecordStatesInPeriod(
          DEFAULT_LEDGER_ID,
          'log-1',
          period
        )
      )
        .map((state) => state.rowId)
        .sort()

    it('returns rows whose date falls in the period, in every stored date shape', async () => {
      await commit([
        ['date', { DATE_RECEIVED: '2026-09-01' }],
        ['datetime-on-last-day', { DATE_RECEIVED: '2026-09-30T13:45:00.000Z' }],
        ['month', { DATE_RECEIVED: '2026-09' }]
      ])

      expect(await rowIdsIn(SEPTEMBER)).toEqual([
        'date',
        'datetime-on-last-day',
        'month'
      ])
    })

    it('leaves out rows dated either side of the period', async () => {
      await commit([
        ['august', { DATE_RECEIVED: '2026-08-31T23:59:59.000Z' }],
        ['october', { DATE_RECEIVED: '2026-10-01' }],
        ['october-month', { DATE_RECEIVED: '2026-10' }]
      ])

      expect(await rowIdsIn(SEPTEMBER)).toEqual([])
    })

    it('returns a row placed in the period by any of its date fields', async () => {
      await commit([
        [
          'exported-in-september',
          { DATE_RECEIVED: '2026-08-14', DATE_EXPORTED: '2026-09-02' }
        ]
      ])

      expect(await rowIdsIn(SEPTEMBER)).toEqual(['exported-in-september'])
    })

    it('spans every month of a quarterly period', async () => {
      await commit([
        ['june', { DATE_RECEIVED: '2026-06-30' }],
        ['july', { DATE_RECEIVED: '2026-07-01' }],
        ['august', { DATE_RECEIVED: '2026-08' }],
        ['september', { DATE_RECEIVED: '2026-09-30T08:00:00.000Z' }]
      ])

      expect(await rowIdsIn(THIRD_QUARTER)).toEqual([
        'august',
        'july',
        'september'
      ])
    })

    it('returns December rows without running into the next year', async () => {
      await commit([
        ['december', { DATE_RECEIVED: '2026-12-31T23:00:00.000Z' }],
        ['next-january', { DATE_RECEIVED: '2027-01-01' }]
      ])

      expect(await rowIdsIn(DECEMBER)).toEqual(['december'])
    })

    it('returns rows of the undated type that carry no date in the undated field', async () => {
      await commit([
        ['missing', {}],
        ['null', { DATE_RECEIVED: null }],
        ['sent-on-missing', {}, { wasteRecordType: WASTE_RECORD_TYPE.SENT_ON }]
      ])

      expect(await rowIdsIn(SEPTEMBER)).toEqual(['missing', 'null'])
    })

    it('ignores date values that are not strings', async () => {
      await commit([['numeric', { DATE_RECEIVED: 20260915 }]])

      expect(await rowIdsIn(SEPTEMBER)).toEqual([])
    })

    it('returns each row as a waste record state', async () => {
      await commit([['row-1', { DATE_RECEIVED: '2026-09-15' }]])

      const [state] = await repository.findWasteRecordStatesInPeriod(
        DEFAULT_LEDGER_ID,
        'log-1',
        SEPTEMBER
      )

      expect(Object.keys(state).sort()).toEqual([
        'classification',
        'data',
        'processingType',
        'rowId',
        'wasteRecordType'
      ])
    })

    it('returns only the rows of the ledger and summary log asked for', async () => {
      await commit([['own', { DATE_RECEIVED: '2026-09-15' }]])
      await repository.upsertSummaryLogRowStates(
        { ...DEFAULT_LEDGER_ID, registrationNumber: 'REG-2' },
        [
          buildSummaryLogRowStateEntry({
            rowId: 'other-ledger',
            data: { DATE_RECEIVED: '2026-09-15' }
          })
        ],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({
            rowId: 'other-log',
            data: { DATE_RECEIVED: '2026-09-16' }
          })
        ],
        'log-2'
      )

      expect(await rowIdsIn(SEPTEMBER)).toEqual(['own'])
    })
  })
}
