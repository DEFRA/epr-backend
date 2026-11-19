import { anotherOrganisationNumber } from '#waste-records/repository/test-data.js'
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
          registrationNumber: 'REG-reg-empty',
          accreditationNumber: 'ACC-acc-empty'
        })
      )
      expect(result).toBeNull()
    })

    it('returns the only event when one exists', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-single',
          accreditationNumber: 'ACC-acc-single',
          number: 1,
          closingBalance: { amount: 50, availableAmount: 40 }
        })
      ])

      const result = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-single',
          accreditationNumber: 'ACC-acc-single'
        })
      )

      expect(result).not.toBeNull()
      expect(result.number).toBe(1)
      expect(result.closingBalance).toEqual({ amount: 50, availableAmount: 40 })
    })

    it('returns the highest-numbered event when many exist', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-many',
          accreditationNumber: 'ACC-acc-many',
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 100 },
          closingBalance: { amount: 10, availableAmount: 10 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-many',
          accreditationNumber: 'ACC-acc-many',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 },
          closingBalance: { amount: 20, availableAmount: 18 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-many',
          accreditationNumber: 'ACC-acc-many',
          number: 3,
          payload: { summaryLogId: 'log-3', creditTotal: 300 },
          closingBalance: { amount: 30, availableAmount: 25 }
        })
      ])

      const result = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-many',
          accreditationNumber: 'ACC-acc-many'
        })
      )

      expect(result.number).toBe(3)
      expect(result.closingBalance).toEqual({ amount: 30, availableAmount: 25 })
    })

    it('isolates results by ledgerId', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-x',
          accreditationNumber: 'ACC-acc-x',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-y',
          accreditationNumber: 'ACC-acc-y',
          number: 1,
          payload: { summaryLogId: 'log-y', creditTotal: 500 }
        })
      ])

      const x = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-x',
          accreditationNumber: 'ACC-acc-x'
        })
      )
      const y = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-y',
          accreditationNumber: 'ACC-acc-y'
        })
      )

      expect(x.number).toBe(1)
      expect(x.accreditationNumber).toBe('ACC-acc-x')
      expect(y.number).toBe(1)
      expect(y.accreditationNumber).toBe('ACC-acc-y')
    })

    it('does not read a ledger named under a different organisation', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-owned',
          accreditationNumber: 'ACC-acc-owned',
          number: 1
        })
      ])

      const result = await repository.findLatestInLedger(
        buildLedgerId({
          organisationNumber: anotherOrganisationNumber(),
          registrationNumber: 'REG-reg-owned',
          accreditationNumber: 'ACC-acc-owned'
        })
      )

      expect(result).toBeNull()
    })

    it('treats null and non-null accreditation numbers as separate ledgers', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-null-test',
          accreditationNumber: null,
          number: 1,
          closingBalance: { amount: 0, availableAmount: 0 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-null-test',
          accreditationNumber: 'ACC-acc-non-null',
          number: 1,
          closingBalance: { amount: 999, availableAmount: 999 }
        })
      ])

      const nullLedger = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-null-test',
          accreditationNumber: null
        })
      )
      const nonNullLedger = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-null-test',
          accreditationNumber: 'ACC-acc-non-null'
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
          registrationNumber: 'REG-reg-precision',
          accreditationNumber: 'ACC-acc-precision',
          number: 1,
          payload: { summaryLogId: 'log-precise', creditTotal: 200.005 },
          openingBalance: { amount: 0, availableAmount: 0 },
          closingBalance: { amount: 200.005, availableAmount: 200.005 }
        })
      ])

      const result = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-precision',
          accreditationNumber: 'ACC-acc-precision'
        })
      )

      expect(result.closingBalance.amount).toBe(200.005)
      expect(result.closingBalance.availableAmount).toBe(200.005)
      expect(result.payload.creditTotal).toBe(200.005)
    })
  })
}
