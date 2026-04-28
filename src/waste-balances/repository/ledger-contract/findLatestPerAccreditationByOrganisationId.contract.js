import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerTransaction } from '../ledger-test-data.js'

export const testFindLatestPerAccreditationByOrganisationIdBehaviour = (it) => {
  describe('findLatestPerAccreditationByOrganisationId', () => {
    let repository

    beforeEach(async ({ ledgerRepository }) => {
      repository = await ledgerRepository()
    })

    it('returns an empty array when the organisation has no transactions', async () => {
      const result =
        await repository.findLatestPerAccreditationByOrganisationId('org-empty')
      expect(result).toEqual([])
    })

    it('returns the latest transaction for a single accreditation under the organisation', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          organisationId: 'org-X',
          accreditationId: 'acc-1',
          number: 1,
          closingBalance: { amount: 10, availableAmount: 10 }
        }),
        buildLedgerTransaction({
          organisationId: 'org-X',
          accreditationId: 'acc-1',
          number: 2,
          closingBalance: { amount: 25, availableAmount: 22 }
        })
      ])

      const result =
        await repository.findLatestPerAccreditationByOrganisationId('org-X')

      expect(result).toHaveLength(1)
      expect(result[0].accreditationId).toBe('acc-1')
      expect(result[0].number).toBe(2)
      expect(result[0].closingBalance).toEqual({
        amount: 25,
        availableAmount: 22
      })
    })

    it('returns the latest per accreditation across multiple accreditations under the same organisation', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          organisationId: 'org-X',
          accreditationId: 'acc-A',
          number: 1,
          closingBalance: { amount: 10, availableAmount: 10 }
        }),
        buildLedgerTransaction({
          organisationId: 'org-X',
          accreditationId: 'acc-A',
          number: 2,
          closingBalance: { amount: 30, availableAmount: 28 }
        }),
        buildLedgerTransaction({
          organisationId: 'org-X',
          accreditationId: 'acc-B',
          number: 1,
          closingBalance: { amount: 100, availableAmount: 100 }
        })
      ])

      const result =
        await repository.findLatestPerAccreditationByOrganisationId('org-X')

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

    it('returns the highest-numbered transaction regardless of insert order', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          organisationId: 'org-X',
          accreditationId: 'acc-A',
          number: 5,
          closingBalance: { amount: 50, availableAmount: 50 }
        }),
        buildLedgerTransaction({
          organisationId: 'org-X',
          accreditationId: 'acc-A',
          number: 2,
          closingBalance: { amount: 20, availableAmount: 20 }
        })
      ])

      const result =
        await repository.findLatestPerAccreditationByOrganisationId('org-X')

      expect(result).toHaveLength(1)
      expect(result[0].number).toBe(5)
      expect(result[0].closingBalance).toEqual({
        amount: 50,
        availableAmount: 50
      })
    })

    it('does not include accreditations from other organisations', async () => {
      await repository.insertTransactions([
        buildLedgerTransaction({
          organisationId: 'org-X',
          accreditationId: 'acc-A',
          number: 1
        }),
        buildLedgerTransaction({
          organisationId: 'org-Y',
          accreditationId: 'acc-B',
          number: 1
        })
      ])

      const result =
        await repository.findLatestPerAccreditationByOrganisationId('org-X')
      expect(result).toHaveLength(1)
      expect(result[0].accreditationId).toBe('acc-A')
    })
  })
}
