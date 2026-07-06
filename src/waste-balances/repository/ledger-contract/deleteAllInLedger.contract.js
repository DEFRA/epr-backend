import { describe, beforeEach, expect } from 'vitest'

import { buildStreamEvent } from '../ledger-test-data.js'

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
        buildStreamEvent({
          registrationId: 'reg-del',
          accreditationId: 'acc-del',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-del',
          accreditationId: 'acc-del',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      ])

      const count = await repository.deleteAllInLedger('reg-del', 'acc-del')

      expect(count).toBe(2)

      const latest = await repository.findLatestInLedger('reg-del', 'acc-del')
      expect(latest).toBeNull()
    })

    it('returns 0 when the ledger is empty', async () => {
      const count = await repository.deleteAllInLedger('reg-empty', 'acc-empty')

      expect(count).toBe(0)
    })

    it('does not affect events in other partitions', async () => {
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-keep',
          accreditationId: 'acc-keep',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-remove',
          accreditationId: 'acc-remove',
          number: 1
        })
      ])

      await repository.deleteAllInLedger('reg-remove', 'acc-remove')

      const kept = await repository.findLatestInLedger('reg-keep', 'acc-keep')
      expect(kept).not.toBeNull()
      expect(kept?.registrationId).toBe('reg-keep')
    })

    it("deletes one accreditation's ledgerId without touching the same registration's registered-only ledger", async () => {
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-shared',
          accreditationId: 'acc-1',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-shared',
          accreditationId: null,
          number: 1,
          payload: { summaryLogId: 'reg-only-log', creditTotal: 0 },
          closingBalance: { amount: 0, availableAmount: 0 }
        })
      ])

      const count = await repository.deleteAllInLedger('reg-shared', 'acc-1')

      expect(count).toBe(1)

      const accreditationStream = await repository.findLatestInLedger(
        'reg-shared',
        'acc-1'
      )
      expect(accreditationStream).toBeNull()

      const registeredOnlyStream = await repository.findLatestInLedger(
        'reg-shared',
        null
      )
      expect(registeredOnlyStream).not.toBeNull()
      expect(registeredOnlyStream?.accreditationId).toBeNull()
    })
  })
}
