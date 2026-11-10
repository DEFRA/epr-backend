import { describe, beforeEach, expect } from 'vitest'

import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID
} from '../test-data.js'

const NUMBERS = Object.freeze({
  organisationNumber: '500001',
  registrationNumber: 'REG-1',
  accreditationNumber: 'ACC-1'
})

export const testNumbersBehaviour = (it) => {
  describe('numbers', () => {
    let repository

    beforeEach((/** @type {*} */ { summaryLogRowStatesRepository }) => {
      repository = summaryLogRowStatesRepository()
    })

    it('stores the numbers it is given', async () => {
      const [state] = await repository.upsertSummaryLogRowStates(
        NUMBERS,
        [buildSummaryLogRowStateEntry()],
        'log-1'
      )

      expect(state).toMatchObject(NUMBERS)
    })

    it('does not store the ids of the ledger', async () => {
      const [state] = await repository.upsertSummaryLogRowStates(
        { ...DEFAULT_LEDGER_ID, ...NUMBERS },
        [buildSummaryLogRowStateEntry()],
        'log-1'
      )

      expect(state).not.toHaveProperty('organisationId')
      expect(state).not.toHaveProperty('registrationId')
      expect(state).not.toHaveProperty('accreditationId')
    })

    it('stores a null accreditation number for a registered-only row', async () => {
      const [state] = await repository.upsertSummaryLogRowStates(
        { ...NUMBERS, accreditationNumber: null },
        [buildSummaryLogRowStateEntry()],
        'log-1'
      )

      expect(state.accreditationNumber).toBeNull()
    })

    it('rejects a row state without the organisation and registration numbers', async () => {
      await expect(
        repository.upsertSummaryLogRowStates(
          { accreditationNumber: 'ACC-1' },
          [buildSummaryLogRowStateEntry()],
          'log-1'
        )
      ).rejects.toThrow(
        'Invalid row state data: "organisationNumber" is required; "registrationNumber" is required'
      )
    })

    it('rejects a row state with no accreditation number, not even null', async () => {
      await expect(
        repository.upsertSummaryLogRowStates(
          {
            organisationNumber: NUMBERS.organisationNumber,
            registrationNumber: NUMBERS.registrationNumber
          },
          [buildSummaryLogRowStateEntry()],
          'log-1'
        )
      ).rejects.toThrow(
        'Invalid row state data: "accreditationNumber" is required'
      )
    })
  })
}
