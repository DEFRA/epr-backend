import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerTransaction } from '../ledger-test-data.js'

export const testFindLatestByAccreditationIdBehaviour = (it) => {
  describe('findLatestByAccreditationId', () => {
    let repository

    beforeEach(async ({ ledgerRepository }) => {
      repository = await ledgerRepository()
    })

    it('returns null when no transactions exist for the accreditation', async () => {
      const result = await repository.findLatestByAccreditationId('acc-empty')
      expect(result).toBeNull()
    })

    it('returns the only transaction when one exists', async () => {
      const inserted = await repository.insertTransaction(
        buildLedgerTransaction({
          accreditationId: 'acc-single',
          number: 1,
          closingAmount: 50,
          closingAvailableAmount: 40
        })
      )

      const result = await repository.findLatestByAccreditationId('acc-single')

      expect(result).not.toBeNull()
      expect(result.id).toBe(inserted.id)
      expect(result.number).toBe(1)
      expect(result.closingAmount).toBe(50)
      expect(result.closingAvailableAmount).toBe(40)
    })

    it('returns the highest-numbered transaction when many exist', async () => {
      await repository.insertTransaction(
        buildLedgerTransaction({
          accreditationId: 'acc-many',
          number: 1,
          closingAmount: 10,
          closingAvailableAmount: 10
        })
      )
      await repository.insertTransaction(
        buildLedgerTransaction({
          accreditationId: 'acc-many',
          number: 3,
          closingAmount: 30,
          closingAvailableAmount: 25
        })
      )
      await repository.insertTransaction(
        buildLedgerTransaction({
          accreditationId: 'acc-many',
          number: 2,
          closingAmount: 20,
          closingAvailableAmount: 18
        })
      )

      const result = await repository.findLatestByAccreditationId('acc-many')

      expect(result.number).toBe(3)
      expect(result.closingAmount).toBe(30)
      expect(result.closingAvailableAmount).toBe(25)
    })

    it('isolates results by accreditation', async () => {
      await repository.insertTransaction(
        buildLedgerTransaction({ accreditationId: 'acc-x', number: 1 })
      )
      await repository.insertTransaction(
        buildLedgerTransaction({ accreditationId: 'acc-y', number: 5 })
      )

      const x = await repository.findLatestByAccreditationId('acc-x')
      const y = await repository.findLatestByAccreditationId('acc-y')

      expect(x.number).toBe(1)
      expect(y.number).toBe(5)
    })
  })
}
