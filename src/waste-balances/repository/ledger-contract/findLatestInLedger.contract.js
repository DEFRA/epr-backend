import { describe, beforeEach, expect } from 'vitest'

import { anotherOrganisationNumber } from '#waste-records/repository/test-data.js'

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
          registrationNumber: 'REG-empty',
          accreditationNumber: 'ACC-empty'
        })
      )
      expect(result).toBeNull()
    })

    it('returns the only event when one exists', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-single',
          accreditationNumber: 'ACC-single',
          number: 1,
          closingBalance: { amount: 50, availableAmount: 40 }
        })
      ])

      const result = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-single',
          accreditationNumber: 'ACC-single'
        })
      )

      expect(result).not.toBeNull()
      expect(result.number).toBe(1)
      expect(result.closingBalance).toEqual({ amount: 50, availableAmount: 40 })
    })

    it('returns the highest-numbered event when many exist', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-many',
          accreditationNumber: 'ACC-many',
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 100 },
          closingBalance: { amount: 10, availableAmount: 10 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-many',
          accreditationNumber: 'ACC-many',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 },
          closingBalance: { amount: 20, availableAmount: 18 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-many',
          accreditationNumber: 'ACC-many',
          number: 3,
          payload: { summaryLogId: 'log-3', creditTotal: 300 },
          closingBalance: { amount: 30, availableAmount: 25 }
        })
      ])

      const result = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-many',
          accreditationNumber: 'ACC-many'
        })
      )

      expect(result.number).toBe(3)
      expect(result.closingBalance).toEqual({ amount: 30, availableAmount: 25 })
    })

    it('isolates results by ledgerId', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-x',
          accreditationNumber: 'ACC-x',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-y',
          accreditationNumber: 'ACC-y',
          number: 1,
          payload: { summaryLogId: 'log-y', creditTotal: 500 }
        })
      ])

      const x = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-x',
          accreditationNumber: 'ACC-x'
        })
      )
      const y = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-y',
          accreditationNumber: 'ACC-y'
        })
      )

      expect(x.number).toBe(1)
      expect(x.accreditationNumber).toBe('ACC-x')
      expect(y.number).toBe(1)
      expect(y.accreditationNumber).toBe('ACC-y')
    })

    it('does not read a ledger named under a different organisation', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-owned',
          accreditationNumber: 'ACC-owned',
          number: 1
        })
      ])

      const result = await repository.findLatestInLedger(
        buildLedgerId({
          organisationNumber: anotherOrganisationNumber(),
          registrationNumber: 'REG-owned',
          accreditationNumber: 'ACC-owned'
        })
      )

      expect(result).toBeNull()
    })

    it('treats null and non-null accreditation numbers as separate ledgers', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-null-test',
          accreditationNumber: null,
          number: 1,
          closingBalance: { amount: 0, availableAmount: 0 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-null-test',
          accreditationNumber: 'ACC-non-null',
          number: 1,
          closingBalance: { amount: 999, availableAmount: 999 }
        })
      ])

      const nullLedger = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-null-test',
          accreditationNumber: null
        })
      )
      const nonNullLedger = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-null-test',
          accreditationNumber: 'ACC-non-null'
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
          registrationNumber: 'REG-precision',
          accreditationNumber: 'ACC-precision',
          number: 1,
          payload: { summaryLogId: 'log-precise', creditTotal: 200.005 },
          openingBalance: { amount: 0, availableAmount: 0 },
          closingBalance: { amount: 200.005, availableAmount: 200.005 }
        })
      ])

      const result = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-precision',
          accreditationNumber: 'ACC-precision'
        })
      )

      expect(result.closingBalance.amount).toBe(200.005)
      expect(result.closingBalance.availableAmount).toBe(200.005)
      expect(result.payload.creditTotal).toBe(200.005)
    })
  })
}
