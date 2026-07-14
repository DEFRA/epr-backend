import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerEvent, buildLedgerId } from '../ledger-test-data.js'

const CUTOFF = new Date('2026-07-01T00:00:00.000Z')

export const testFindLatestInLedgerBeforeBehaviour = (it) => {
  describe('findLatestInLedgerBefore', () => {
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
      const result = await repository.findLatestInLedgerBefore(
        buildLedgerId({
          registrationId: 'reg-empty',
          accreditationId: 'acc-empty'
        }),
        CUTOFF
      )
      expect(result).toBeNull()
    })

    it('returns null when every event was created at or after the cutoff', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-after',
          accreditationId: 'acc-after',
          number: 1,
          createdAt: new Date('2026-07-05T09:00:00.000Z')
        })
      ])

      const result = await repository.findLatestInLedgerBefore(
        buildLedgerId({
          registrationId: 'reg-after',
          accreditationId: 'acc-after'
        }),
        CUTOFF
      )

      expect(result).toBeNull()
    })

    it('does not return an event created at exactly the cutoff instant', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-exact',
          accreditationId: 'acc-exact',
          number: 1,
          createdAt: CUTOFF
        })
      ])

      const result = await repository.findLatestInLedgerBefore(
        buildLedgerId({
          registrationId: 'reg-exact',
          accreditationId: 'acc-exact'
        }),
        CUTOFF
      )

      expect(result).toBeNull()
    })

    it('returns the highest-numbered of several events before the cutoff', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-many',
          accreditationId: 'acc-many',
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 100 },
          closingBalance: { amount: 10, availableAmount: 10 },
          createdAt: new Date('2026-05-10T10:00:00.000Z')
        })
      ])
      const [stored] = await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-many',
          accreditationId: 'acc-many',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 },
          closingBalance: { amount: 20, availableAmount: 18 },
          createdAt: new Date('2026-06-20T10:00:00.000Z')
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-many',
          accreditationId: 'acc-many',
          number: 3,
          payload: { summaryLogId: 'log-3', creditTotal: 300 },
          closingBalance: { amount: 30, availableAmount: 25 },
          createdAt: new Date('2026-07-08T10:00:00.000Z')
        })
      ])

      const result = await repository.findLatestInLedgerBefore(
        buildLedgerId({
          registrationId: 'reg-many',
          accreditationId: 'acc-many'
        }),
        CUTOFF
      )

      expect(result.id).toBe(stored.id)
      expect(result.number).toBe(2)
      expect(result.closingBalance).toEqual({ amount: 20, availableAmount: 18 })
    })

    it('picks the highest-numbered event, not the latest-created, when the orders disagree', async () => {
      const [, second] = await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-disorder',
          accreditationId: 'acc-disorder',
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 100 },
          closingBalance: { amount: 10, availableAmount: 10 },
          createdAt: new Date('2026-06-15T10:00:00.000Z')
        }),
        buildLedgerEvent({
          registrationId: 'reg-disorder',
          accreditationId: 'acc-disorder',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 },
          closingBalance: { amount: 20, availableAmount: 18 },
          createdAt: new Date('2026-06-10T10:00:00.000Z')
        })
      ])

      const result = await repository.findLatestInLedgerBefore(
        buildLedgerId({
          registrationId: 'reg-disorder',
          accreditationId: 'acc-disorder'
        }),
        CUTOFF
      )

      expect(result.id).toBe(second.id)
      expect(result.number).toBe(2)
    })

    it('returns an event from long before the cutoff when nothing newer precedes it', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-carry',
          accreditationId: 'acc-carry',
          number: 1,
          closingBalance: { amount: 75, availableAmount: 60 },
          createdAt: new Date('2026-02-14T10:00:00.000Z')
        })
      ])

      const result = await repository.findLatestInLedgerBefore(
        buildLedgerId({
          registrationId: 'reg-carry',
          accreditationId: 'acc-carry'
        }),
        CUTOFF
      )

      expect(result.number).toBe(1)
      expect(result.closingBalance).toEqual({ amount: 75, availableAmount: 60 })
    })

    it('isolates results by ledgerId', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-x',
          accreditationId: 'acc-x',
          number: 1,
          createdAt: new Date('2026-06-01T10:00:00.000Z')
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-y',
          accreditationId: 'acc-y',
          number: 1,
          payload: { summaryLogId: 'log-y', creditTotal: 500 },
          createdAt: new Date('2026-08-01T10:00:00.000Z')
        })
      ])

      const x = await repository.findLatestInLedgerBefore(
        buildLedgerId({ registrationId: 'reg-x', accreditationId: 'acc-x' }),
        CUTOFF
      )
      const y = await repository.findLatestInLedgerBefore(
        buildLedgerId({ registrationId: 'reg-y', accreditationId: 'acc-y' }),
        CUTOFF
      )

      expect(x.number).toBe(1)
      expect(x.accreditationId).toBe('acc-x')
      expect(y).toBeNull()
    })

    it('does not read a ledger named under a different organisation', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          organisationId: 'org-owner',
          registrationId: 'reg-owned',
          accreditationId: 'acc-owned',
          number: 1,
          createdAt: new Date('2026-06-01T10:00:00.000Z')
        })
      ])

      const result = await repository.findLatestInLedgerBefore(
        buildLedgerId({
          organisationId: 'org-stranger',
          registrationId: 'reg-owned',
          accreditationId: 'acc-owned'
        }),
        CUTOFF
      )

      expect(result).toBeNull()
    })

    it('treats null and non-null accreditationId as separate ledgers', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-null-test',
          accreditationId: null,
          number: 1,
          closingBalance: { amount: 0, availableAmount: 0 },
          createdAt: new Date('2026-06-01T10:00:00.000Z')
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-null-test',
          accreditationId: 'acc-non-null',
          number: 1,
          closingBalance: { amount: 999, availableAmount: 999 },
          createdAt: new Date('2026-08-01T10:00:00.000Z')
        })
      ])

      const nullLedger = await repository.findLatestInLedgerBefore(
        buildLedgerId({
          registrationId: 'reg-null-test',
          accreditationId: null
        }),
        CUTOFF
      )
      const nonNullLedger = await repository.findLatestInLedgerBefore(
        buildLedgerId({
          registrationId: 'reg-null-test',
          accreditationId: 'acc-non-null'
        }),
        CUTOFF
      )

      expect(nullLedger.closingBalance).toEqual({
        amount: 0,
        availableAmount: 0
      })
      expect(nonNullLedger).toBeNull()
    })
  })
}
