import { describe, beforeEach, expect } from 'vitest'
import { buildWasteBalance } from './test-data.js'

export const testFindByAccreditationIdBehaviour = (it) => {
  describe('findByAccreditationId', () => {
    let repository

    beforeEach(async ({ wasteBalancesRepository }) => {
      repository = await wasteBalancesRepository()
    })

    it('returns null when no waste balance exists for the accreditation', async () => {
      const result = await repository.findByAccreditationId('acc-nonexistent')

      expect(result).toBeNull()
    })

    it('returns waste balance when it exists for the accreditation', async ({
      insertWasteBalance
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-123',
        organisationId: 'org-1',
        amount: 250,
        availableAmount: 200
      })

      await insertWasteBalance(wasteBalance)

      const result = await repository.findByAccreditationId('acc-123')

      expect(result).not.toBeNull()
      expect(result.accreditationId).toBe('acc-123')
      expect(result.organisationId).toBe('org-1')
      expect(result.amount).toBe(250)
      expect(result.availableAmount).toBe(200)
      expect(result.transactions).toBeDefined()
      expect(result.transactions).toHaveLength(1)
    })

    it('returns correct waste balance when multiple balances exist', async ({
      insertWasteBalances
    }) => {
      const balance1 = buildWasteBalance({
        accreditationId: 'acc-1',
        amount: 100
      })
      const balance2 = buildWasteBalance({
        accreditationId: 'acc-2',
        amount: 200
      })
      const balance3 = buildWasteBalance({
        accreditationId: 'acc-3',
        amount: 300
      })

      await insertWasteBalances([balance1, balance2, balance3])

      const result = await repository.findByAccreditationId('acc-2')

      expect(result).not.toBeNull()
      expect(result.accreditationId).toBe('acc-2')
      expect(result.amount).toBe(200)
    })

    it('throws error when accreditationId is null', async () => {
      await expect(repository.findByAccreditationId(null)).rejects.toThrow()
    })

    it('throws error when accreditationId is undefined', async () => {
      await expect(
        repository.findByAccreditationId(undefined)
      ).rejects.toThrow()
    })

    it('throws error when accreditationId is empty string', async () => {
      await expect(repository.findByAccreditationId('')).rejects.toThrow()
    })

    it('returns waste balance with all transaction fields intact', async ({
      insertWasteBalance
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-456',
        transactions: [
          {
            _id: 'txn-1',
            type: 'credit',
            createdAt: '2025-01-15T10:00:00.000Z',
            createdBy: {
              id: 'user-1'
            },
            amount: 150,
            openingAmount: 0,
            closingAmount: 150,
            openingAvailableAmount: 0,
            closingAvailableAmount: 150,
            entities: [
              {
                id: 'waste-record-123',
                type: 'waste_record:received'
              }
            ]
          }
        ]
      })

      await insertWasteBalance(wasteBalance)

      const result = await repository.findByAccreditationId('acc-456')

      expect(result).not.toBeNull()
      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0]._id).toBe('txn-1')
      expect(result.transactions[0].type).toBe('credit')
      expect(result.transactions[0].createdBy.id).toBe('user-1')
      expect(result.transactions[0].entities).toHaveLength(1)
      expect(result.transactions[0].entities[0].type).toBe(
        'waste_record:received'
      )
    })
  })
}
