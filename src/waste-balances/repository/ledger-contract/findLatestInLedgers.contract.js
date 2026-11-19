import { describe, beforeEach, expect } from 'vitest'

import { anotherOrganisationNumber } from '#waste-records/repository/test-data.js'

import { buildLedgerEvent, buildLedgerId } from '../ledger-test-data.js'

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
        buildLedgerEvent({ registrationNumber: 'REG-reg-unnamed' })
      ])

      expect(await repository.findLatestInLedgers([])).toEqual([])
    })

    it('returns the highest-numbered event of each named ledger', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-a',
          accreditationNumber: 'ACC-acc-a',
          number: 1,
          closingBalance: { amount: 10, availableAmount: 10 }
        }),
        buildLedgerEvent({
          registrationNumber: 'REG-reg-a',
          accreditationNumber: 'ACC-acc-a',
          number: 2,
          closingBalance: { amount: 20, availableAmount: 15 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-b',
          accreditationNumber: 'ACC-acc-b',
          number: 1,
          closingBalance: { amount: 30, availableAmount: 30 }
        })
      ])

      const result = await repository.findLatestInLedgers([
        buildLedgerId({
          registrationNumber: 'REG-reg-a',
          accreditationNumber: 'ACC-acc-a'
        }),
        buildLedgerId({
          registrationNumber: 'REG-reg-b',
          accreditationNumber: 'ACC-acc-b'
        })
      ])

      expect(result).toHaveLength(2)
      expect(result).toContainEqual(
        expect.objectContaining({
          ...buildLedgerId({
            registrationNumber: 'REG-reg-a',
            accreditationNumber: 'ACC-acc-a'
          }),
          number: 2,
          closingBalance: { amount: 20, availableAmount: 15 }
        })
      )
      expect(result).toContainEqual(
        expect.objectContaining({
          ...buildLedgerId({
            registrationNumber: 'REG-reg-b',
            accreditationNumber: 'ACC-acc-b'
          }),
          number: 1,
          closingBalance: { amount: 30, availableAmount: 30 }
        })
      )
    })

    it('leaves out named ledgers with no events', async () => {
      const result = await repository.findLatestInLedgers([
        buildLedgerId({
          registrationNumber: 'REG-reg-empty',
          accreditationNumber: 'ACC-acc-empty'
        })
      ])

      expect(result).toEqual([])
    })

    it('leaves out ledgers that are not named', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-named',
          accreditationNumber: 'ACC-acc-named'
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-other',
          accreditationNumber: 'ACC-acc-other'
        })
      ])

      const result = await repository.findLatestInLedgers([
        buildLedgerId({
          registrationNumber: 'REG-reg-named',
          accreditationNumber: 'ACC-acc-named'
        })
      ])

      expect(result).toHaveLength(1)
      expect(result[0].accreditationNumber).toBe('ACC-acc-named')
    })

    it('does not read a ledger named under a different organisation', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-owned',
          accreditationNumber: 'ACC-acc-owned'
        })
      ])

      const result = await repository.findLatestInLedgers([
        buildLedgerId({
          organisationNumber: anotherOrganisationNumber(),
          registrationNumber: 'REG-reg-owned',
          accreditationNumber: 'ACC-acc-owned'
        })
      ])

      expect(result).toEqual([])
    })
  })
}
