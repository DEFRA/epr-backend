import { describe, beforeEach, expect } from 'vitest'

import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID,
  withNumbers
} from '../test-data.js'

const NUMBERS = Object.freeze({
  organisationNumber: '500001',
  registrationNumber: 'REG-1',
  accreditationNumber: 'ACC-1'
})

const REGISTERED_ONLY_LEDGER_ID = Object.freeze({
  ...DEFAULT_LEDGER_ID,
  accreditationId: null
})

export const testNumbersBehaviour = (it) => {
  describe('numbers', () => {
    let repository

    beforeEach((/** @type {*} */ { summaryLogRowStatesRepository }) => {
      repository = summaryLogRowStatesRepository()
    })

    it('stores the numbers it is given beside the ids', async () => {
      const [state] = await repository.upsertSummaryLogRowStates(
        { ...DEFAULT_LEDGER_ID, ...NUMBERS },
        [buildSummaryLogRowStateEntry()],
        'log-1'
      )

      expect(state).toMatchObject({ ...DEFAULT_LEDGER_ID, ...NUMBERS })
    })

    it('stores a null accreditation number for a registered-only row', async () => {
      const [state] = await repository.upsertSummaryLogRowStates(
        {
          ...REGISTERED_ONLY_LEDGER_ID,
          organisationNumber: NUMBERS.organisationNumber,
          registrationNumber: NUMBERS.registrationNumber,
          accreditationNumber: null
        },
        [buildSummaryLogRowStateEntry()],
        'log-1'
      )

      expect(state.accreditationNumber).toBeNull()
    })

    it('rejects a row state without the organisation and registration numbers', async () => {
      await expect(
        repository.upsertSummaryLogRowStates(
          { ...DEFAULT_LEDGER_ID, accreditationNumber: 'ACC-1' },
          [buildSummaryLogRowStateEntry()],
          'log-1'
        )
      ).rejects.toThrow(
        'Invalid row state data: "organisationNumber" is required; "registrationNumber" is required'
      )
    })

    it('rejects an accredited row state without an accreditation number', async () => {
      await expect(
        repository.upsertSummaryLogRowStates(
          { ...withNumbers(DEFAULT_LEDGER_ID), accreditationNumber: null },
          [buildSummaryLogRowStateEntry()],
          'log-1'
        )
      ).rejects.toThrow(
        'Invalid row state data: "accreditationNumber" must be a string'
      )
    })

    it('rejects an accreditation number on a registered-only row state', async () => {
      await expect(
        repository.upsertSummaryLogRowStates(
          {
            ...withNumbers(REGISTERED_ONLY_LEDGER_ID),
            accreditationNumber: 'ACC-1'
          },
          [buildSummaryLogRowStateEntry()],
          'log-1'
        )
      ).rejects.toThrow(
        'Invalid row state data: "accreditationNumber" must be [null]'
      )
    })
  })
}
