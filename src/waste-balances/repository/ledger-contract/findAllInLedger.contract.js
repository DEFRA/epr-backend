import { anotherOrganisationNumber } from '#waste-records/repository/test-data.js'
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
          registrationNumber: 'REG-reg-empty',
          accreditationNumber: 'ACC-acc-empty'
        })
      )
      expect(result).toEqual([])
    })

    it('returns all events ordered by number ascending', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-all',
          accreditationNumber: 'ACC-acc-all',
          number: 1,
          closingBalance: { amount: 10, availableAmount: 10 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-all',
          accreditationNumber: 'ACC-acc-all',
          number: 2,
          closingBalance: { amount: 20, availableAmount: 18 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-all',
          accreditationNumber: 'ACC-acc-all',
          number: 3,
          closingBalance: { amount: 30, availableAmount: 25 }
        })
      ])

      const result = await repository.findAllInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-all',
          accreditationNumber: 'ACC-acc-all'
        })
      )

      expect(result).toHaveLength(3)
      expect(result[0].number).toBe(1)
      expect(result[1].number).toBe(2)
      expect(result[2].number).toBe(3)
    })

    it('does not return events from a different ledgerId', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-a',
          accreditationNumber: 'ACC-acc-a',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-b',
          accreditationNumber: 'ACC-acc-b',
          number: 1
        })
      ])

      const result = await repository.findAllInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-a',
          accreditationNumber: 'ACC-acc-a'
        })
      )

      expect(result).toHaveLength(1)
      expect(result[0].registrationNumber).toBe('REG-reg-a')
      expect(result[0].accreditationNumber).toBe('ACC-acc-a')
    })

    it('reads the ledger a registration holds with no accreditation', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-registered-only',
          accreditationNumber: null,
          number: 1
        })
      ])

      const result = await repository.findAllInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-registered-only',
          accreditationNumber: null
        })
      )

      expect(result).toHaveLength(1)
      expect(result[0].accreditationNumber).toBeNull()
    })

    it('does not read an accreditation of the registration whose unaccredited ledger it names', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-both',
          accreditationNumber: 'ACC-acc-both',
          number: 1
        })
      ])

      const result = await repository.findAllInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-both',
          accreditationNumber: null
        })
      )

      expect(result).toEqual([])
    })

    it('does not read a ledger named under a different organisation', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-owned',
          accreditationNumber: 'ACC-acc-owned',
          number: 1
        })
      ])

      const result = await repository.findAllInLedger(
        buildLedgerId({
          organisationNumber: anotherOrganisationNumber(),
          registrationNumber: 'REG-reg-owned',
          accreditationNumber: 'ACC-acc-owned'
        })
      )

      expect(result).toEqual([])
    })
  })
}
