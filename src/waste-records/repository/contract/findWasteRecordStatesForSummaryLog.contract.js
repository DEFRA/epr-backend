import { describe, beforeEach, expect } from 'vitest'

import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID
} from '../test-data.js'

const OTHER_ORGANISATION = { ...DEFAULT_LEDGER_ID, organisationId: 'org-2' }
const OTHER_REGISTRATION = { ...DEFAULT_LEDGER_ID, registrationId: 'reg-2' }
const OTHER_ACCREDITATION = { ...DEFAULT_LEDGER_ID, accreditationId: 'acc-2' }
const REGISTERED_ONLY = { ...DEFAULT_LEDGER_ID, accreditationId: null }

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

    it('returns each row as a waste record state, carrying nothing of how it is stored', async () => {
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

    it('returns every row of the summary log', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({ rowId: 'row-1' }),
          buildSummaryLogRowStateEntry({ rowId: 'row-2' }),
          buildSummaryLogRowStateEntry({ rowId: 'row-3' })
        ],
        'log-1'
      )

      const states = await repository.findWasteRecordStatesForSummaryLog(
        DEFAULT_LEDGER_ID,
        'log-1'
      )

      expect(states.map((state) => state.rowId).sort()).toEqual([
        'row-1',
        'row-2',
        'row-3'
      ])
    })

    it('returns only the rows the summary log committed', async () => {
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

    describe.each([
      ['organisation', OTHER_ORGANISATION],
      ['registration', OTHER_REGISTRATION],
      ['accreditation', OTHER_ACCREDITATION],
      ['registered-only phase', REGISTERED_ONLY]
    ])('the same summary log under a different %s', (_, otherLedgerId) => {
      beforeEach(async () => {
        await repository.upsertSummaryLogRowStates(
          DEFAULT_LEDGER_ID,
          [
            buildSummaryLogRowStateEntry({
              rowId: 'row-1',
              data: { tonnage: 10 }
            })
          ],
          'log-1'
        )
        await repository.upsertSummaryLogRowStates(
          otherLedgerId,
          [
            buildSummaryLogRowStateEntry({
              rowId: 'row-1',
              data: { tonnage: 20 }
            })
          ],
          'log-1'
        )
      })

      it('returns only the rows of the ledger asked for', async () => {
        const own = await repository.findWasteRecordStatesForSummaryLog(
          DEFAULT_LEDGER_ID,
          'log-1'
        )

        expect(own).toHaveLength(1)
        expect(own[0].data).toEqual({ tonnage: 10 })
      })

      it('returns only the rows of the other ledger when it is the one asked for', async () => {
        const other = await repository.findWasteRecordStatesForSummaryLog(
          otherLedgerId,
          'log-1'
        )

        expect(other).toHaveLength(1)
        expect(other[0].data).toEqual({ tonnage: 20 })
      })
    })
  })
}
