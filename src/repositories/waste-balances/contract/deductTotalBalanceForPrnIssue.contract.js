import { describe, beforeEach, expect } from 'vitest'
import { buildWasteBalance } from './test-data.js'
import { WASTE_BALANCE_TRANSACTION_ENTITY_TYPE } from '#domain/waste-balances/model.js'

export const testDeductTotalBalanceForPrnIssueBehaviour = (it) => {
  describe('deductTotalBalanceForPrnIssue', () => {
    let repository

    beforeEach(async ({ wasteBalancesRepository }) => {
      repository = await wasteBalancesRepository()
    })

    it('deducts tonnage from total balance only', async ({
      insertWasteBalance
    }) => {
      // Available was already deducted when PRN was created
      // Now we deduct from total when PRN is issued
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-issue-1',
        organisationId: 'org-1',
        amount: 500,
        availableAmount: 450 // 50 already ringfenced for this PRN
      })

      await insertWasteBalance(wasteBalance)

      await repository.deductTotalBalanceForPrnIssue({
        accreditationId: 'acc-issue-1',
        organisationId: 'org-1',
        prnId: 'prn-123',
        tonnage: 50,
        userId: 'user-abc'
      })

      const result = await repository.findByAccreditationId('acc-issue-1')

      expect(result.amount).toBe(450) // Total deducted
      expect(result.availableAmount).toBe(450) // Available unchanged
    })

    it('creates transaction with PRN_ISSUED entity type', async ({
      insertWasteBalance
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-issue-2',
        organisationId: 'org-1',
        amount: 200,
        availableAmount: 175, // 25.5 already ringfenced
        transactions: []
      })

      await insertWasteBalance(wasteBalance)

      await repository.deductTotalBalanceForPrnIssue({
        accreditationId: 'acc-issue-2',
        organisationId: 'org-1',
        prnId: 'prn-456',
        tonnage: 25.5,
        userId: 'user-xyz'
      })

      const result = await repository.findByAccreditationId('acc-issue-2')

      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0].amount).toBe(25.5)
      expect(result.transactions[0].entities[0].id).toBe('prn-456')
      expect(result.transactions[0].entities[0].type).toBe(
        WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.PRN_ISSUED
      )
    })

    it('records opening and closing balances correctly', async ({
      insertWasteBalance
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-issue-3',
        organisationId: 'org-1',
        amount: 300,
        availableAmount: 270,
        transactions: []
      })

      await insertWasteBalance(wasteBalance)

      await repository.deductTotalBalanceForPrnIssue({
        accreditationId: 'acc-issue-3',
        organisationId: 'org-1',
        prnId: 'prn-789',
        tonnage: 30,
        userId: 'user-123'
      })

      const result = await repository.findByAccreditationId('acc-issue-3')
      const transaction = result.transactions[0]

      expect(transaction.openingAmount).toBe(300)
      expect(transaction.closingAmount).toBe(270)
      expect(transaction.openingAvailableAmount).toBe(270)
      expect(transaction.closingAvailableAmount).toBe(270)
    })

    it('does nothing when no balance exists', async () => {
      await repository.deductTotalBalanceForPrnIssue({
        accreditationId: 'acc-nonexistent',
        organisationId: 'org-1',
        prnId: 'prn-999',
        tonnage: 10,
        userId: 'user-456'
      })

      const result = await repository.findByAccreditationId('acc-nonexistent')
      expect(result).toBeNull()
    })

    it('increments version number', async ({ insertWasteBalance }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-issue-4',
        organisationId: 'org-1',
        version: 5
      })

      await insertWasteBalance(wasteBalance)

      await repository.deductTotalBalanceForPrnIssue({
        accreditationId: 'acc-issue-4',
        organisationId: 'org-1',
        prnId: 'prn-111',
        tonnage: 10,
        userId: 'user-789'
      })

      const result = await repository.findByAccreditationId('acc-issue-4')
      expect(result.version).toBe(6)
    })
  })
}
