import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerEvent, buildLedgerId } from '../ledger-test-data.js'

const NUMBERS = Object.freeze({
  organisationNumber: '500001',
  registrationNumber: 'REG-1',
  accreditationNumber: 'ACC-1'
})

const ALL_NUMBERS = [
  'organisationNumber',
  'registrationNumber',
  'accreditationNumber'
]

const LEDGER_ID = Object.freeze(buildLedgerId())

const REGISTERED_ONLY_LEDGER_ID = Object.freeze(
  buildLedgerId({ accreditationId: null })
)

export const testNumbersBehaviour = (it) => {
  describe('numbers', () => {
    let repository
    /** @type {(keys: string[]) => Promise<unknown>} */
    let removeStoredNumbers

    beforeEach(
      async (
        /** @type {*} */ { ledgerRepository, removeStoredNumbers: remove }
      ) => {
        repository = await ledgerRepository()
        removeStoredNumbers = remove
      }
    )

    /**
     * Events as stored before the numbers were written beside the ids.
     *
     * @param {*} ledgerId
     * @param {number} count
     * @param {string[]} [missing]
     */
    const storeWithout = async (ledgerId, count, missing = ALL_NUMBERS) => {
      await appendTo(ledgerId, count)
      await removeStoredNumbers(missing)
    }

    /**
     * @param {*} ledgerId
     * @param {number} count
     * @param {object} [overrides]
     */
    const appendTo = async (ledgerId, count, overrides = {}) => {
      const head = (await repository.findLatestInLedger(ledgerId))?.number ?? 0
      await repository.appendEvents(
        Array.from({ length: count }, (_, index) =>
          buildLedgerEvent({
            ...ledgerId,
            number: head + index + 1,
            ...overrides
          })
        )
      )
    }

    it('stores the numbers it is given beside the ids', async () => {
      const [event] = await repository.appendEvents([
        buildLedgerEvent({ ...LEDGER_ID, ...NUMBERS })
      ])

      expect(event).toMatchObject({ ...LEDGER_ID, ...NUMBERS })
      expect(await repository.findLatestInLedger(LEDGER_ID)).toMatchObject(
        NUMBERS
      )
    })

    it('stores a null accreditation number for a registered-only ledger', async () => {
      await appendTo(REGISTERED_ONLY_LEDGER_ID, 1)

      expect(
        (await repository.findLatestInLedger(REGISTERED_ONLY_LEDGER_ID))
          .accreditationNumber
      ).toBeNull()
    })

    it('stores an event without the numbers it is written without', async () => {
      const {
        organisationNumber: _organisationNumber,
        registrationNumber: _registrationNumber,
        ...withoutNumbers
      } = buildLedgerEvent()

      await repository.appendEvents([withoutNumbers])

      const event = await repository.findLatestInLedger(withoutNumbers)
      expect(event).not.toHaveProperty('organisationNumber')
      expect(event).not.toHaveProperty('registrationNumber')
      expect(event).toHaveProperty(
        'accreditationNumber',
        withoutNumbers.accreditationNumber
      )
    })

    it('reads back an event stored without the numbers', async () => {
      await storeWithout(LEDGER_ID, 1)

      const event = await repository.findLatestInLedger(LEDGER_ID)
      for (const key of ALL_NUMBERS) {
        expect(event).not.toHaveProperty(key)
      }
    })

    describe('findLedgerIdsWithoutNumbers', () => {
      it('counts the events of each ledger lacking a number', async () => {
        await storeWithout(LEDGER_ID, 2)
        await storeWithout(REGISTERED_ONLY_LEDGER_ID, 1)

        const found = await repository.findLedgerIdsWithoutNumbers()

        expect(found).toHaveLength(2)
        expect(found).toEqual(
          expect.arrayContaining([
            { ledgerId: LEDGER_ID, documents: 2, lacking: ALL_NUMBERS },
            {
              ledgerId: REGISTERED_ONLY_LEDGER_ID,
              documents: 1,
              lacking: ALL_NUMBERS
            }
          ])
        )
      })

      it('counts only the events lacking a number', async () => {
        await storeWithout(LEDGER_ID, 1)
        await appendTo(LEDGER_ID, 1)

        expect(await repository.findLedgerIdsWithoutNumbers()).toEqual([
          { ledgerId: LEDGER_ID, documents: 1, lacking: ALL_NUMBERS }
        ])
      })

      it('names each number any of the ledger’s events lacks', async () => {
        await storeWithout(LEDGER_ID, 1, [
          'registrationNumber',
          'accreditationNumber'
        ])
        await storeWithout(LEDGER_ID, 1, ['accreditationNumber'])

        expect(await repository.findLedgerIdsWithoutNumbers()).toEqual([
          {
            ledgerId: LEDGER_ID,
            documents: 2,
            lacking: ['registrationNumber', 'accreditationNumber']
          }
        ])
      })

      it('takes a null accreditation number as held', async () => {
        await appendTo(REGISTERED_ONLY_LEDGER_ID, 1)

        expect(await repository.findLedgerIdsWithoutNumbers()).toEqual([])
      })
    })

    describe('countEventsLacking', () => {
      it('counts the ledger’s events lacking one of the numbers given, as assignNumbers would change', async () => {
        await appendTo(REGISTERED_ONLY_LEDGER_ID, 1)
        await storeWithout(LEDGER_ID, 1)
        await storeWithout(LEDGER_ID, 1, ['registrationNumber'])
        const given = { organisationNumber: NUMBERS.organisationNumber }

        expect(await repository.countEventsLacking(LEDGER_ID, given)).toBe(1)
        expect(await repository.assignNumbers(LEDGER_ID, given)).toBe(1)
      })

      it('counts nothing when given no numbers', async () => {
        await storeWithout(LEDGER_ID, 1)

        expect(await repository.countEventsLacking(LEDGER_ID, {})).toBe(0)
      })
    })

    describe('assignNumbers', () => {
      it('adds the numbers to every event of the ledger, returning how many it changed', async () => {
        await storeWithout(LEDGER_ID, 2)

        expect(await repository.assignNumbers(LEDGER_ID, NUMBERS)).toBe(2)

        expect(await repository.findAllInLedger(LEDGER_ID)).toEqual([
          expect.objectContaining(NUMBERS),
          expect.objectContaining(NUMBERS)
        ])
        expect(await repository.findLedgerIdsWithoutNumbers()).toEqual([])
      })

      it('leaves the events of another ledger alone', async () => {
        await storeWithout(REGISTERED_ONLY_LEDGER_ID, 1)

        expect(await repository.assignNumbers(LEDGER_ID, NUMBERS)).toBe(0)
        expect(await repository.findLedgerIdsWithoutNumbers()).toEqual([
          {
            ledgerId: REGISTERED_ONLY_LEDGER_ID,
            documents: 1,
            lacking: ALL_NUMBERS
          }
        ])
      })

      it('keeps a number an event already holds', async () => {
        await appendTo(LEDGER_ID, 1, { organisationNumber: '500009' })
        await removeStoredNumbers(['registrationNumber', 'accreditationNumber'])

        await repository.assignNumbers(LEDGER_ID, NUMBERS)

        expect(await repository.findLatestInLedger(LEDGER_ID)).toMatchObject({
          organisationNumber: '500009',
          registrationNumber: NUMBERS.registrationNumber,
          accreditationNumber: NUMBERS.accreditationNumber
        })
      })

      it('adds only the numbers it is given', async () => {
        await storeWithout(LEDGER_ID, 1)

        await repository.assignNumbers(LEDGER_ID, {
          organisationNumber: NUMBERS.organisationNumber
        })

        const event = await repository.findLatestInLedger(LEDGER_ID)
        expect(event.organisationNumber).toBe(NUMBERS.organisationNumber)
        expect(event).not.toHaveProperty('registrationNumber')
        expect(event).not.toHaveProperty('accreditationNumber')
      })

      it('changes nothing when given no numbers', async () => {
        await storeWithout(LEDGER_ID, 1)

        expect(await repository.assignNumbers(LEDGER_ID, {})).toBe(0)
      })

      it('rejects a number that is not a string', async () => {
        await expect(
          repository.assignNumbers(LEDGER_ID, { organisationNumber: 500001 })
        ).rejects.toThrow(
          'Invalid ledger event numbers: "organisationNumber" must be a string'
        )
      })

      it('adds a null accreditation number to a registered-only event', async () => {
        await storeWithout(REGISTERED_ONLY_LEDGER_ID, 1)

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
