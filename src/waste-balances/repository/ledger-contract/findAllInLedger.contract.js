import { describe, beforeEach, expect } from 'vitest'

import { anotherOrganisationNumber } from '#waste-records/repository/test-data.js'

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
          registrationNumber: 'REG-empty',
          accreditationNumber: 'ACC-empty'
        })
      )
      expect(result).toEqual([])
    })

    it('returns all events ordered by number ascending', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-all',
          accreditationNumber: 'ACC-all',
          number: 1,
          closingBalance: { amount: 10, availableAmount: 10 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-all',
          accreditationNumber: 'ACC-all',
          number: 2,
          closingBalance: { amount: 20, availableAmount: 18 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-all',
          accreditationNumber: 'ACC-all',
          number: 3,
          closingBalance: { amount: 30, availableAmount: 25 }
        })
      ])

      const result = await repository.findAllInLedger(
        buildLedgerId({
          registrationNumber: 'REG-all',
          accreditationNumber: 'ACC-all'
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
          registrationNumber: 'REG-a',
          accreditationNumber: 'ACC-a',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-b',
          accreditationNumber: 'ACC-b',
          number: 1
        })
      ])

      const result = await repository.findAllInLedger(
        buildLedgerId({
          registrationNumber: 'REG-a',
          accreditationNumber: 'ACC-a'
        })
      )

      expect(result).toHaveLength(1)
      expect(result[0].registrationNumber).toBe('REG-a')
      expect(result[0].accreditationNumber).toBe('ACC-a')
    })

    it('reads the ledger a registration holds with no accreditation', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-registered-only',
          accreditationNumber: null,
          number: 1
        })
      ])

      const result = await repository.findAllInLedger(
        buildLedgerId({
          registrationNumber: 'REG-registered-only',
          accreditationNumber: null
        })
      )

      expect(result).toHaveLength(1)
      expect(result[0].accreditationNumber).toBeNull()
    })

    it('does not read an accreditation of the registration whose unaccredited ledger it names', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-both',
          accreditationNumber: 'ACC-both',
          number: 1
        })
      ])

      const result = await repository.findAllInLedger(
        buildLedgerId({
          registrationNumber: 'REG-both',
          accreditationNumber: null
        })
      )

      expect(result).toEqual([])
    })

    it('does not read a ledger named under a different organisation', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-owned',
          accreditationNumber: 'ACC-owned',
          number: 1
        })
      ])

      const result = await repository.findAllInLedger(
        buildLedgerId({
          organisationNumber: anotherOrganisationNumber(),
          registrationNumber: 'REG-owned',
          accreditationNumber: 'ACC-owned'
        })
      )

      expect(result).toEqual([])
    })
  })
}
