import { describe, beforeEach, expect } from 'vitest'

import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID
} from '../test-data.js'

const REGISTERED_ONLY = { ...DEFAULT_LEDGER_ID, accreditationId: null }
const OTHER_ACCREDITATION = { ...DEFAULT_LEDGER_ID, accreditationId: 'acc-2' }
const OTHER_ORGANISATION = { ...DEFAULT_LEDGER_ID, organisationId: 'org-2' }
const OTHER_REGISTRATION = { ...DEFAULT_LEDGER_ID, registrationId: 'reg-2' }

export const testFindRowStatesForSummaryLogFileBehaviour = (it) => {
  describe('findRowStatesForSummaryLogFile', () => {
    let repository

    beforeEach((/** @type {*} */ { summaryLogRowStatesRepository }) => {
      repository = summaryLogRowStatesRepository()
    })

    /**
     * @param {string} fileId
     * @param {{ organisationId: string, registrationId: string }} [ledgerId]
     */
    const find = (fileId, ledgerId = DEFAULT_LEDGER_ID) =>
      repository.findRowStatesForSummaryLogFile(
        ledgerId.organisationId,
        ledgerId.registrationId,
        fileId
      )

    it('returns an empty list for a file id nothing was submitted under', async () => {
      expect(await find('unknown-file')).toEqual([])
    })

    it('returns every row state of the submission', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({ rowId: 'row-1' }),
          buildSummaryLogRowStateEntry({ rowId: 'row-2' }),
          buildSummaryLogRowStateEntry({ rowId: 'row-3' })
        ],
        'file-1'
      )

      const rowStates = await find('file-1')

      expect(rowStates.map((state) => state.rowId).sort()).toEqual([
        'row-1',
        'row-2',
        'row-3'
      ])
    })

    it('returns the full row state, carrying the partition that wrote it', async () => {
      await repository.upsertSummaryLogRowStates(
        REGISTERED_ONLY,
        [buildSummaryLogRowStateEntry({ rowId: 'row-1' })],
        'file-1'
      )

      const [rowState] = await find('file-1')

      expect(rowState).toMatchObject({
        ...REGISTERED_ONLY,
        rowId: 'row-1',
        classification: {
          outcome: 'INCLUDED',
          reasons: [],
          transactionAmount: 10
        }
      })
    })

    it('returns the rows of whichever partition wrote them without being told which', async () => {
      await repository.upsertSummaryLogRowStates(
        OTHER_ACCREDITATION,
        [buildSummaryLogRowStateEntry({ rowId: 'row-1' })],
        'file-1'
      )

      const rowStates = await find('file-1')

      expect(rowStates).toHaveLength(1)
      expect(rowStates[0].accreditationId).toBe('acc-2')
    })

    it('returns an empty list for that file id under a different registration', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [buildSummaryLogRowStateEntry({ rowId: 'row-1' })],
        'file-1'
      )

      expect(await find('file-1', OTHER_REGISTRATION)).toEqual([])
    })

    it('returns an empty list for that file id under a different organisation', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [buildSummaryLogRowStateEntry({ rowId: 'row-1' })],
        'file-1'
      )

      expect(await find('file-1', OTHER_ORGANISATION)).toEqual([])
    })

    it('returns the rows of an earlier submission, not only the latest', async () => {
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { tonnage: 1 } })
        ],
        'file-old'
      )
      await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [
          buildSummaryLogRowStateEntry({ rowId: 'row-1', data: { tonnage: 2 } })
        ],
        'file-new'
      )

      const rowStates = await find('file-old')

      expect(rowStates).toHaveLength(1)
      expect(rowStates[0].data).toEqual({ tonnage: 1 })
    })
  })
}
