import { describe, beforeEach, expect } from 'vitest'

import { nextYear } from '#common/helpers/dates/year.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID,
  DEFAULT_YEAR
} from '../test-data.js'

const EXPORTED = WASTE_RECORD_TYPE.EXPORTED

/** @param {string} rowId */
const exportedRow = (rowId, data = { tonnage: 10 }) =>
  buildSummaryLogRowStateEntry({ rowId, wasteRecordType: EXPORTED, data })

export const testFindRowStatesInSummaryLogBehaviour = (it) => {
  describe('findRowStatesInSummaryLog', () => {
    let repository

    beforeEach((/** @type {*} */ { summaryLogRowStatesRepository }) => {
      repository = summaryLogRowStatesRepository()
    })

    const find = (rowIds, ledgerId = DEFAULT_LEDGER_ID) =>
      repository.findRowStatesInSummaryLog(ledgerId, 'log-1', {
        wasteRecordType: EXPORTED,
        rowIds
      })

    it('returns the named rows the summary log holds, with their state ids', async () => {
      const [first, second] = await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [exportedRow('1500'), exportedRow('1501'), exportedRow('1502')],
        'log-1'
      )

      const states = await find(['1500', '1501'])

      expect(states.map(({ id, rowId }) => ({ id, rowId }))).toEqual(
        expect.arrayContaining([
          { id: first.id, rowId: '1500' },
          { id: second.id, rowId: '1501' }
        ])
      )
      expect(states).toHaveLength(2)
    })

    it('returns nothing when no rows are named', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [exportedRow('1500')],
        'log-1'
      )

      expect(await find([])).toEqual([])
    })

    it('returns the state the summary log holds, not an earlier state of the row', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [exportedRow('1500', { tonnage: 10 })],
        'log-0'
      )
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [exportedRow('1500', { tonnage: 20 })],
        'log-1'
      )

      const states = await find(['1500'])

      expect(states.map(({ data }) => data)).toEqual([{ tonnage: 20 }])
    })

    it('returns only rows of the waste record type asked for', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [buildSummaryLogRowStateEntry({ rowId: '1500' })],
        'log-1'
      )

      expect(await find(['1500'])).toEqual([])
    })

    it('returns only rows of the ledger asked for', async () => {
      const otherYear = { ...DEFAULT_LEDGER_ID, year: nextYear(DEFAULT_YEAR) }
      await repository.upsertSummaryLogRowStates(
        otherYear,
        [exportedRow('1500')],
        'log-1'
      )

      expect(await find(['1500'])).toEqual([])
    })
  })
}
