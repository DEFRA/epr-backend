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
  })
}
