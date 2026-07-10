import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerEvent, buildLedgerId } from '../ledger-test-data.js'

export const testFindLatestInLedgerBehaviour = (it) => {
  describe('findLatestInLedger', () => {
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

    it('returns null when no events exist for the ledger', async () => {
      const result = await repository.findLatestInLedger(
        buildLedgerId({
          registrationId: 'reg-empty',
          accreditationId: 'acc-empty'
        })
      )
      expect(result).toBeNull()
    })

    it('returns the only event when one exists', async () => {
      const [stored] = await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-single',
          accreditationId: 'acc-single',
          number: 1,
          closingBalance: { amount: 50, availableAmount: 40 }
        })
      ])

      const result = await repository.findLatestInLedger(
        buildLedgerId({
          registrationId: 'reg-single',
          accreditationId: 'acc-single'
        })
      )

      expect(result).not.toBeNull()
      expect(result.id).toBe(stored.id)
      expect(result.number).toBe(1)
      expect(result.closingBalance).toEqual({ amount: 50, availableAmount: 40 })
    })

    it('returns the highest-numbered event when many exist', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-many',
          accreditationId: 'acc-many',
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 100 },
          closingBalance: { amount: 10, availableAmount: 10 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-many',
          accreditationId: 'acc-many',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 },
          closingBalance: { amount: 20, availableAmount: 18 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-many',
          accreditationId: 'acc-many',
          number: 3,
          payload: { summaryLogId: 'log-3', creditTotal: 300 },
          closingBalance: { amount: 30, availableAmount: 25 }
        })
      ])

      const result = await repository.findLatestInLedger(
        buildLedgerId({
          registrationId: 'reg-many',
          accreditationId: 'acc-many'
        })
      )

      expect(result.number).toBe(3)
      expect(result.closingBalance).toEqual({ amount: 30, availableAmount: 25 })
    })

    it('isolates results by ledgerId', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-x',
          accreditationId: 'acc-x',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-y',
          accreditationId: 'acc-y',
          number: 1,
          payload: { summaryLogId: 'log-y', creditTotal: 500 }
        })
      ])

      const x = await repository.findLatestInLedger(
        buildLedgerId({ registrationId: 'reg-x', accreditationId: 'acc-x' })
      )
      const y = await repository.findLatestInLedger(
        buildLedgerId({ registrationId: 'reg-y', accreditationId: 'acc-y' })
      )

      expect(x.number).toBe(1)
      expect(x.accreditationId).toBe('acc-x')
      expect(y.number).toBe(1)
      expect(y.accreditationId).toBe('acc-y')
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

      const result = await repository.findLatestInLedger(
        buildLedgerId({
          organisationId: 'org-stranger',
          registrationId: 'reg-owned',
          accreditationId: 'acc-owned'
        })
      )

      expect(result).toBeNull()
    })

    it('treats null and non-null accreditationId as separate ledgers', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-null-test',
          accreditationId: null,
          number: 1,
          closingBalance: { amount: 0, availableAmount: 0 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-null-test',
          accreditationId: 'acc-non-null',
          number: 1,
          closingBalance: { amount: 999, availableAmount: 999 }
        })
      ])

      const nullLedger = await repository.findLatestInLedger(
        buildLedgerId({
          registrationId: 'reg-null-test',
          accreditationId: null
        })
      )
      const nonNullLedger = await repository.findLatestInLedger(
        buildLedgerId({
          registrationId: 'reg-null-test',
          accreditationId: 'acc-non-null'
        })
      )

      expect(nullLedger.closingBalance).toEqual({
        amount: 0,
        availableAmount: 0
      })
      expect(nonNullLedger.closingBalance).toEqual({
        amount: 999,
        availableAmount: 999
      })
    })

    it('round-trips high-precision amounts exactly', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-precision',
          accreditationId: 'acc-precision',
          number: 1,
          payload: { summaryLogId: 'log-precise', creditTotal: 200.005 },
          openingBalance: { amount: 0, availableAmount: 0 },
          closingBalance: { amount: 200.005, availableAmount: 200.005 }
        })
      ])

      const result = await repository.findLatestInLedger(
        buildLedgerId({
          registrationId: 'reg-precision',
          accreditationId: 'acc-precision'
        })
      )

      expect(result.closingBalance.amount).toBe(200.005)
      expect(result.closingBalance.availableAmount).toBe(200.005)
      expect(result.payload.creditTotal).toBe(200.005)
    })
  })
}
