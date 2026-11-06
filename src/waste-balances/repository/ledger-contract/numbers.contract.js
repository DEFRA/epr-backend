import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerEvent, buildLedgerId } from '../ledger-test-data.js'

const NUMBERS = Object.freeze({
  organisationNumber: '500001',
  registrationNumber: 'REG-1',
  accreditationNumber: 'ACC-1'
})

const LEDGER_ID = Object.freeze(buildLedgerId())

const REGISTERED_ONLY_LEDGER_ID = Object.freeze(
  buildLedgerId({ accreditationId: null })
)

export const testNumbersBehaviour = (it) => {
  describe('numbers', () => {
    let repository

    beforeEach(async (/** @type {*} */ { ledgerRepository }) => {
      repository = await ledgerRepository()
    })

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
      await repository.appendEvents([
        buildLedgerEvent({ ...REGISTERED_ONLY_LEDGER_ID })
      ])

      expect(
        (await repository.findLatestInLedger(REGISTERED_ONLY_LEDGER_ID))
          .accreditationNumber
      ).toBeNull()
    })

    it('refuses an event without its organisation and registration numbers, storing nothing', async () => {
      const {
        organisationNumber: _organisationNumber,
        registrationNumber: _registrationNumber,
        ...withoutNumbers
      } = buildLedgerEvent()

      await expect(repository.appendEvents([withoutNumbers])).rejects.toThrow(
        'Invalid ledger event data: "organisationNumber" is required; "registrationNumber" is required'
      )
      expect(await repository.findLatestInLedger(LEDGER_ID)).toBeNull()
    })

    it('refuses an accredited event without its accreditation number', async () => {
      const { accreditationNumber: _accreditationNumber, ...withoutNumber } =
        buildLedgerEvent()

      await expect(repository.appendEvents([withoutNumber])).rejects.toThrow(
        'Invalid ledger event data: "accreditationNumber" is required'
      )
    })

    it('refuses a registered-only event without its null accreditation number', async () => {
      const { accreditationNumber: _accreditationNumber, ...withoutNumber } =
        buildLedgerEvent({ ...REGISTERED_ONLY_LEDGER_ID })

      await expect(repository.appendEvents([withoutNumber])).rejects.toThrow(
        'Invalid ledger event data: "accreditationNumber" is required'
      )
    })
  })
}
