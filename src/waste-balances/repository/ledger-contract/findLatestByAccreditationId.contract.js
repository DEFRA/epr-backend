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
          closing: { amount: 50, availableAmount: 40 }
        })
      )

      const result = await repository.findLatestByAccreditationId('acc-single')

      expect(result).not.toBeNull()
      expect(result.id).toBe(inserted.id)
      expect(result.number).toBe(1)
      expect(result.closing).toEqual({ amount: 50, availableAmount: 40 })
    })

    it('returns the highest-numbered transaction when many exist', async () => {
      await repository.insertTransaction(
        buildLedgerTransaction({
          accreditationId: 'acc-many',
          number: 1,
          closing: { amount: 10, availableAmount: 10 }
        })
      )
      await repository.insertTransaction(
        buildLedgerTransaction({
          accreditationId: 'acc-many',
          number: 3,
          closing: { amount: 30, availableAmount: 25 }
        })
      )
      await repository.insertTransaction(
        buildLedgerTransaction({
          accreditationId: 'acc-many',
          number: 2,
          closing: { amount: 20, availableAmount: 18 }
        })
      )

      const result = await repository.findLatestByAccreditationId('acc-many')

      expect(result.number).toBe(3)
      expect(result.closing).toEqual({ amount: 30, availableAmount: 25 })
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
