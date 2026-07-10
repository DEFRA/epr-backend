import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerEvent, buildLedgerId } from '../ledger-test-data.js'

export const testFindAllInLedgerBehaviour = (it) => {
  describe('findAllInLedger', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ ledgerRepository: import('../ledger-port.js').WasteBalanceLedgerRepositoryFactory }} */ {
          ledgerRepository
        }
      ) => {
        repository = await ledgerRepository()
      }
    )

    it('returns an empty array when no events exist for the ledger', async () => {
      const result = await repository.findAllInLedger(
        buildLedgerId({
          registrationId: 'reg-empty',
          accreditationId: 'acc-empty'
        })
      )
      expect(result).toEqual([])
    })

    it('returns all events ordered by number ascending', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-all',
          accreditationId: 'acc-all',
          number: 1,
          closingBalance: { amount: 10, availableAmount: 10 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-all',
          accreditationId: 'acc-all',
          number: 2,
          closingBalance: { amount: 20, availableAmount: 18 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-all',
          accreditationId: 'acc-all',
          number: 3,
          closingBalance: { amount: 30, availableAmount: 25 }
        })
      ])

      const result = await repository.findAllInLedger(
        buildLedgerId({ registrationId: 'reg-all', accreditationId: 'acc-all' })
      )

      expect(result).toHaveLength(3)
      expect(result[0].number).toBe(1)
      expect(result[1].number).toBe(2)
      expect(result[2].number).toBe(3)
    })

    it('does not return events from a different ledgerId', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-a',
          accreditationId: 'acc-a',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-b',
          accreditationId: 'acc-b',
          number: 1
        })
      ])

      const result = await repository.findAllInLedger(
        buildLedgerId({ registrationId: 'reg-a', accreditationId: 'acc-a' })
      )

      expect(result).toHaveLength(1)
      expect(result[0].registrationId).toBe('reg-a')
      expect(result[0].accreditationId).toBe('acc-a')
    })

    it('does not read a ledger named under a different organisation', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          organisationId: 'org-owner',
          registrationId: 'reg-owned',
          accreditationId: 'acc-owned',
          number: 1
        })
      ])

      const result = await repository.findAllInLedger(
        buildLedgerId({
          organisationId: 'org-stranger',
          registrationId: 'reg-owned',
          accreditationId: 'acc-owned'
        })
      )

      expect(result).toEqual([])
    })
  })
}
