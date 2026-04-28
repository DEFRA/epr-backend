import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerTransaction } from '../ledger-test-data.js'

export const testFindLatestPerAccreditationByRegistrationIdBehaviour = (it) => {
  describe('findLatestPerAccreditationByRegistrationId', () => {
    let repository

    beforeEach(async ({ ledgerRepository }) => {
      repository = await ledgerRepository()
    })

    it('returns an empty array when the registration has no transactions', async () => {
      const result =
        await repository.findLatestPerAccreditationByRegistrationId('reg-empty')
      expect(result).toEqual([])
    })

    it('returns the latest transaction for a single accreditation under the registration', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          registrationId: 'reg-X',
          accreditationId: 'acc-1',
          number: 1,
          closingBalance: { amount: 10, availableAmount: 10 }
        }),
        buildLedgerTransaction({
          registrationId: 'reg-X',
          accreditationId: 'acc-1',
          number: 2,
          closingBalance: { amount: 25, availableAmount: 22 }
        })
      ])

      const result =
        await repository.findLatestPerAccreditationByRegistrationId('reg-X')

      expect(result).toHaveLength(1)
      expect(result[0].accreditationId).toBe('acc-1')
      expect(result[0].number).toBe(2)
    })

    it('returns the latest per accreditation across multiple accreditations under the same registration', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          registrationId: 'reg-X',
          accreditationId: 'acc-A',
          number: 1,
          closingBalance: { amount: 10, availableAmount: 10 }
        }),
        buildLedgerTransaction({
          registrationId: 'reg-X',
          accreditationId: 'acc-A',
          number: 2,
          closingBalance: { amount: 30, availableAmount: 28 }
        }),
        buildLedgerTransaction({
          registrationId: 'reg-X',
          accreditationId: 'acc-B',
          number: 1,
          closingBalance: { amount: 100, availableAmount: 100 }
        })
      ])

      const result =
        await repository.findLatestPerAccreditationByRegistrationId('reg-X')

      expect(result).toHaveLength(2)

      const byAcc = new Map(result.map((t) => [t.accreditationId, t]))
      expect(byAcc.get('acc-A').closingBalance).toEqual({
        amount: 30,
        availableAmount: 28
      })
      expect(byAcc.get('acc-B').closingBalance).toEqual({
        amount: 100,
        availableAmount: 100
      })
    })

    it('does not include accreditations from other registrations', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          registrationId: 'reg-X',
          accreditationId: 'acc-A',
          number: 1
        }),
        buildLedgerTransaction({
          registrationId: 'reg-Y',
          accreditationId: 'acc-B',
          number: 1
        })
      ])

      const result =
        await repository.findLatestPerAccreditationByRegistrationId('reg-X')
      expect(result).toHaveLength(1)
      expect(result[0].accreditationId).toBe('acc-A')
    })
  })
}
