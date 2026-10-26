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

    it('stores no number it is not given', async () => {
      const [state] = await repository.upsertSummaryLogRowStates(
        DEFAULT_LEDGER_ID,
        [buildSummaryLogRowStateEntry()],
        'log-1'
      )

      expect(state).not.toHaveProperty('organisationNumber')
      expect(state).not.toHaveProperty('registrationNumber')
      expect(state).not.toHaveProperty('accreditationNumber')
    })

    describe('findLedgerIdsWithoutNumbers', () => {
      it('counts the row states of each ledger lacking a number', async () => {
        await repository.upsertSummaryLogRowStates(
          DEFAULT_LEDGER_ID,
          [
            buildSummaryLogRowStateEntry({ rowId: 'row-1' }),
            buildSummaryLogRowStateEntry({ rowId: 'row-2' })
          ],
          'log-1'
        )
        await repository.upsertSummaryLogRowStates(
          REGISTERED_ONLY_LEDGER_ID,
          [buildSummaryLogRowStateEntry()],
          'log-2'
        )

        const found = await repository.findLedgerIdsWithoutNumbers()

        expect(found).toHaveLength(2)
        expect(found).toEqual(
          expect.arrayContaining([
            { ledgerId: DEFAULT_LEDGER_ID, documents: 2 },
            { ledgerId: REGISTERED_ONLY_LEDGER_ID, documents: 1 }
          ])
        )
      })

      it('counts only the row states lacking a number', async () => {
        await repository.upsertSummaryLogRowStates(
          DEFAULT_LEDGER_ID,
          [buildSummaryLogRowStateEntry({ rowId: 'row-1' })],
          'log-1'
        )
        await repository.upsertSummaryLogRowStates(
          { ...DEFAULT_LEDGER_ID, ...NUMBERS },
          [buildSummaryLogRowStateEntry({ rowId: 'row-2' })],
          'log-2'
        )

        expect(await repository.findLedgerIdsWithoutNumbers()).toEqual([
          { ledgerId: DEFAULT_LEDGER_ID, documents: 1 }
        ])
      })

      it('takes a null accreditation number as held', async () => {
        await repository.upsertSummaryLogRowStates(
          {
            ...REGISTERED_ONLY_LEDGER_ID,
            organisationNumber: NUMBERS.organisationNumber,
            registrationNumber: NUMBERS.registrationNumber,
            accreditationNumber: null
          },
          [buildSummaryLogRowStateEntry()],
          'log-1'
        )

        expect(await repository.findLedgerIdsWithoutNumbers()).toEqual([])
      })
    })

    describe('assignNumbers', () => {
      it('adds the numbers to every row state of the ledger, returning how many it changed', async () => {
        await repository.upsertSummaryLogRowStates(
          DEFAULT_LEDGER_ID,
          [
            buildSummaryLogRowStateEntry({ rowId: 'row-1' }),
            buildSummaryLogRowStateEntry({ rowId: 'row-2' })
          ],
          'log-1'
        )

        expect(await repository.assignNumbers(DEFAULT_LEDGER_ID, NUMBERS)).toBe(
          2
        )

        const states = await repository.findRowStatesForSummaryLogFile(
          DEFAULT_LEDGER_ID.organisationId,
          DEFAULT_LEDGER_ID.registrationId,
          'log-1'
        )
        expect(states).toEqual([
          expect.objectContaining(NUMBERS),
          expect.objectContaining(NUMBERS)
        ])
        expect(await repository.findLedgerIdsWithoutNumbers()).toEqual([])
      })

      it('leaves the row states of another ledger alone', async () => {
        await repository.upsertSummaryLogRowStates(
          REGISTERED_ONLY_LEDGER_ID,
          [buildSummaryLogRowStateEntry()],
          'log-1'
        )

        expect(await repository.assignNumbers(DEFAULT_LEDGER_ID, NUMBERS)).toBe(
          0
        )
        expect(await repository.findLedgerIdsWithoutNumbers()).toEqual([
          { ledgerId: REGISTERED_ONLY_LEDGER_ID, documents: 1 }
        ])
      })

      it('keeps a number a row state already holds', async () => {
        await repository.upsertSummaryLogRowStates(
          { ...DEFAULT_LEDGER_ID, organisationNumber: '500009' },
          [buildSummaryLogRowStateEntry()],
          'log-1'
        )

        await repository.assignNumbers(DEFAULT_LEDGER_ID, NUMBERS)

        const [state] = await repository.findRowStatesForSummaryLogFile(
          DEFAULT_LEDGER_ID.organisationId,
          DEFAULT_LEDGER_ID.registrationId,
          'log-1'
        )
        expect(state).toMatchObject({
          organisationNumber: '500009',
          registrationNumber: NUMBERS.registrationNumber,
          accreditationNumber: NUMBERS.accreditationNumber
        })
      })

      it('adds only the numbers it is given', async () => {
        await repository.upsertSummaryLogRowStates(
          DEFAULT_LEDGER_ID,
          [buildSummaryLogRowStateEntry()],
          'log-1'
        )

        await repository.assignNumbers(DEFAULT_LEDGER_ID, {
          organisationNumber: NUMBERS.organisationNumber
        })

        const [state] = await repository.findRowStatesForSummaryLogFile(
          DEFAULT_LEDGER_ID.organisationId,
          DEFAULT_LEDGER_ID.registrationId,
          'log-1'
        )
        expect(state.organisationNumber).toBe(NUMBERS.organisationNumber)
        expect(state).not.toHaveProperty('registrationNumber')
        expect(state).not.toHaveProperty('accreditationNumber')
      })

      it('changes nothing when given no numbers', async () => {
        await repository.upsertSummaryLogRowStates(
          DEFAULT_LEDGER_ID,
          [buildSummaryLogRowStateEntry()],
          'log-1'
        )

        expect(await repository.assignNumbers(DEFAULT_LEDGER_ID, {})).toBe(0)
      })

      it('rejects a number that is not a string', async () => {
        await expect(
          repository.assignNumbers(DEFAULT_LEDGER_ID, {
            organisationNumber: 500001
          })
        ).rejects.toThrow(
          'Invalid row state numbers: "organisationNumber" must be a string'
        )
      })

      it('adds a null accreditation number to a registered-only row state', async () => {
        await repository.upsertSummaryLogRowStates(
          REGISTERED_ONLY_LEDGER_ID,
          [buildSummaryLogRowStateEntry()],
          'log-1'
        )

        await repository.assignNumbers(REGISTERED_ONLY_LEDGER_ID, {
          organisationNumber: NUMBERS.organisationNumber,
          registrationNumber: NUMBERS.registrationNumber,
          accreditationNumber: null
        })

        expect(await repository.findLedgerIdsWithoutNumbers()).toEqual([])
      })
    })
  })
}
