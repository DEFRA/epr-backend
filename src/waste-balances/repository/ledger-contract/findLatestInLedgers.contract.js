import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerEvent, buildLedgerNumbers } from '../ledger-test-data.js'

export const testFindLatestInLedgersBehaviour = (it) => {
  describe('findLatestInLedgers', () => {
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

    it('returns an empty array when no ledgers are named', async () => {
      await repository.appendEvents([
        buildLedgerEvent({ registrationId: 'reg-unnamed' })
      ])

      expect(await repository.findLatestInLedgers([])).toEqual([])
    })

    it('returns the highest-numbered event of each named ledger', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-a',
          accreditationId: 'acc-a',
          number: 1,
          closingBalance: { amount: 10, availableAmount: 10 }
        }),
        buildLedgerEvent({
          registrationId: 'reg-a',
          accreditationId: 'acc-a',
          number: 2,
          closingBalance: { amount: 20, availableAmount: 15 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-b',
          accreditationId: 'acc-b',
          number: 1,
          closingBalance: { amount: 30, availableAmount: 30 }
        })
      ])

      const result = await repository.findLatestInLedgers([
        buildLedgerNumbers({
          registrationId: 'reg-a',
          accreditationId: 'acc-a'
        }),
        buildLedgerNumbers({
          registrationId: 'reg-b',
          accreditationId: 'acc-b'
        })
      ])

      expect(result).toHaveLength(2)
      expect(result).toContainEqual(
        expect.objectContaining({
          ...buildLedgerNumbers({
            registrationId: 'reg-a',
            accreditationId: 'acc-a'
          }),
          number: 2,
          closingBalance: { amount: 20, availableAmount: 15 }
        })
      )
      expect(result).toContainEqual(
        expect.objectContaining({
          ...buildLedgerNumbers({
            registrationId: 'reg-b',
            accreditationId: 'acc-b'
          }),
          number: 1,
          closingBalance: { amount: 30, availableAmount: 30 }
        })
      )
    })

    it('leaves out named ledgers with no events', async () => {
      const result = await repository.findLatestInLedgers([
        buildLedgerNumbers({
          registrationId: 'reg-empty',
          accreditationId: 'acc-empty'
        })
      ])

      expect(result).toEqual([])
    })

    it('leaves out ledgers that are not named', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-named',
          accreditationId: 'acc-named'
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-other',
          accreditationId: 'acc-other'
        })
      ])

      const result = await repository.findLatestInLedgers([
        buildLedgerNumbers({
          registrationId: 'reg-named',
          accreditationId: 'acc-named'
        })
      ])

      expect(result).toHaveLength(1)
      expect(result[0].accreditationNumber).toBe('ACC-acc-named')
    })

    it('does not read a ledger named under a different organisation', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          organisationId: 'org-owner',
          registrationId: 'reg-owned',
          accreditationId: 'acc-owned'
        })
      ])

      const result = await repository.findLatestInLedgers([
        buildLedgerNumbers({
          organisationId: 'org-stranger',
          registrationId: 'reg-owned',
          accreditationId: 'acc-owned'
        })
      ])

      expect(result).toEqual([])
    })
  })
}
