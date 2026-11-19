import { describe, beforeEach, expect } from 'vitest'

import { anotherOrganisationNumber } from '#waste-records/repository/test-data.js'

import { buildLedgerEvent, buildLedgerId } from '../ledger-test-data.js'

/**
 * @typedef {object} LedgerContractContext
 * @property {import('../ledger-port.js').WasteBalanceLedgerRepositoryFactory} ledgerRepository
 */

export const testDeleteAllInLedgerBehaviour = (it) => {
  describe('deleteAllInLedger (@migration PAE-1382)', () => {
    /** @type {import('../ledger-port.js').WasteBalanceLedgerRepository} */
    let repository

    beforeEach(
      async (/** @type {LedgerContractContext} */ { ledgerRepository }) => {
        repository = await ledgerRepository()
      }
    )

    it('deletes all events for the given ledgerId and returns the count', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-del',
          accreditationNumber: 'ACC-acc-del',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-del',
          accreditationNumber: 'ACC-acc-del',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      ])

      const count = await repository.deleteAllInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-del',
          accreditationNumber: 'ACC-acc-del'
        })
      )

      expect(count).toBe(2)

      const latest = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-del',
          accreditationNumber: 'ACC-acc-del'
        })
      )
      expect(latest).toBeNull()
    })

    it('returns 0 when the ledger is empty', async () => {
      const count = await repository.deleteAllInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-empty',
          accreditationNumber: 'ACC-acc-empty'
        })
      )

      expect(count).toBe(0)
    })

    it('does not affect events in other ledgers', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-keep',
          accreditationNumber: 'ACC-acc-keep',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-remove',
          accreditationNumber: 'ACC-acc-remove',
          number: 1
        })
      ])

      await repository.deleteAllInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-remove',
          accreditationNumber: 'ACC-acc-remove'
        })
      )

      const kept = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-keep',
          accreditationNumber: 'ACC-acc-keep'
        })
      )
      expect(kept).not.toBeNull()
      expect(kept?.registrationNumber).toBe(
        buildLedgerId({ registrationNumber: 'REG-reg-keep' }).registrationNumber
      )
    })

    it('deletes nothing from a ledger named under a different organisation', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-owned',
          accreditationNumber: 'ACC-acc-owned',
          number: 1
        })
      ])

      const count = await repository.deleteAllInLedger(
        buildLedgerId({
          organisationNumber: anotherOrganisationNumber(),
          registrationNumber: 'REG-reg-owned',
          accreditationNumber: 'ACC-acc-owned'
        })
      )

      expect(count).toBe(0)

      const survivor = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-owned',
          accreditationNumber: 'ACC-acc-owned'
        })
      )
      expect(survivor).not.toBeNull()
      expect(survivor?.number).toBe(1)
    })

    it("deletes one accreditation's ledgerId without touching the same registration's registered-only ledger", async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-shared',
          accreditationNumber: 'ACC-acc-1',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-shared',
          accreditationNumber: null,
          number: 1,
          payload: { summaryLogId: 'reg-only-log', creditTotal: 0 },
          closingBalance: { amount: 0, availableAmount: 0 }
        })
      ])

      const count = await repository.deleteAllInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-shared',
          accreditationNumber: 'ACC-acc-1'
        })
      )

      expect(count).toBe(1)

      const accreditationLedger = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-shared',
          accreditationNumber: 'ACC-acc-1'
        })
      )
      expect(accreditationLedger).toBeNull()

      const registeredOnlyLedger = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-shared',
          accreditationNumber: null
        })
      )
      expect(registeredOnlyLedger).not.toBeNull()
      expect(registeredOnlyLedger?.accreditationNumber).toBeNull()
    })
  })
}
