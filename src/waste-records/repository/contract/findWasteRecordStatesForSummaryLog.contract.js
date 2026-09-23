import { describe, beforeEach, expect } from 'vitest'

import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID
} from '../test-data.js'

const OTHER_ACCREDITATION = { ...DEFAULT_LEDGER_ID, accreditationId: 'acc-2' }

export const testFindWasteRecordStatesForSummaryLogBehaviour = (it) => {
  describe('findWasteRecordStatesForSummaryLog', () => {
    let repository

    beforeEach((/** @type {*} */ { summaryLogRowStatesRepository }) => {
      repository = summaryLogRowStatesRepository()
    })

    it('returns an empty list for a summary log with no row states', async () => {
      expect(
        await repository.findWasteRecordStatesForSummaryLog(
          DEFAULT_LEDGER_ID,
          'unknown-log'
        )
      ).toEqual([])
    })

    it('returns each row projected to its domain content', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [buildSummaryLogRowStateEntry({ rowId: 'row-1' })],
        'log-1'
      )

      const [state] = await repository.findWasteRecordStatesForSummaryLog(
        DEFAULT_LEDGER_ID,
        'log-1'
      )

      expect(Object.keys(state).sort()).toEqual([
        'classification',
        'data',
        'processingType',
        'rowId',
        'wasteRecordType'
      ])
    })

    it('carries the same content the stored row state holds', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [buildSummaryLogRowStateEntry({ rowId: 'row-1' })],
        'log-1'
      )

      const [stored] = await repository.findRowStatesForSummaryLog(
        DEFAULT_LEDGER_ID,
        'log-1'
      )
      const [projected] = await repository.findWasteRecordStatesForSummaryLog(
        DEFAULT_LEDGER_ID,
        'log-1'
      )

      expect(projected).toEqual({
        rowId: stored.rowId,
        wasteRecordType: stored.wasteRecordType,
        processingType: stored.processingType,
        data: stored.data,
        classification: stored.classification
      })
    })

    it('returns only the rows whose membership contains the id', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({ rowId: 'row-1' }),
          buildSummaryLogRowStateEntry({ rowId: 'row-2' })
        ],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({
            rowId: 'row-1',
            data: { tonnage: 99 }
          })
        ],
        'log-2'
      )

      const atLog2 = await repository.findWasteRecordStatesForSummaryLog(
        DEFAULT_LEDGER_ID,
        'log-2'
      )

      expect(atLog2).toHaveLength(1)
      expect(atLog2[0].rowId).toBe('row-1')
      expect(atLog2[0].data).toEqual({ tonnage: 99 })
    })

    it('returns only the row states of the ledger asked for', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [buildSummaryLogRowStateEntry({ rowId: 'row-1' })],
        'log-1'
      )
      await repository.upsertSummaryLogRowStates(
        OTHER_ACCREDITATION,
        [
          buildSummaryLogRowStateEntry({
            rowId: 'row-1',
            data: { tonnage: 42 }
          })
        ],
        'log-1'
      )

      const own = await repository.findWasteRecordStatesForSummaryLog(
        DEFAULT_LEDGER_ID,
        'log-1'
      )

      expect(own).toHaveLength(1)
      expect(own[0].data).not.toEqual({ tonnage: 42 })
    })
  })
}
