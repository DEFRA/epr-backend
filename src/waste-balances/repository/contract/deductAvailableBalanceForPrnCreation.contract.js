import { describe, beforeEach, expect } from 'vitest'
import { buildWasteBalance } from './test-data.js'
import { WASTE_BALANCE_TRANSACTION_ENTITY_TYPE } from '#domain/waste-balances/model.js'

export const testDeductAvailableBalanceForPrnCreationBehaviour = (it) => {
  describe('deductAvailableBalanceForPrnCreation', () => {
    let repository

    beforeEach(async ({ wasteBalancesRepository }) => {
      repository = await wasteBalancesRepository()
    })

    it('deducts tonnage from available balance only', async ({
      insertWasteBalance
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-prn-1',
        organisationId: 'org-1',
        amount: 500,
        availableAmount: 400
      })

      await insertWasteBalance(wasteBalance)

      await repository.deductAvailableBalanceForPrnCreation({
        accreditationId: 'acc-prn-1',
        organisationId: 'org-1',
        prnId: 'prn-123',
        tonnage: 50,
        userId: 'user-abc'
      })

      const result = await repository.findByAccreditationId('acc-prn-1')

      expect(result.amount).toBe(500)
      expect(result.availableAmount).toBe(350)
    })

    it('creates transaction with PRN_CREATED entity type', async ({
      insertWasteBalance
    }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-prn-2',
        organisationId: 'org-1',
        amount: 200,
        availableAmount: 200,
        transactions: []
      })

      await insertWasteBalance(wasteBalance)

      await repository.deductAvailableBalanceForPrnCreation({
        accreditationId: 'acc-prn-2',
        organisationId: 'org-1',
        prnId: 'prn-456',
        tonnage: 25.5,
        userId: 'user-xyz'
      })

      const result = await repository.findByAccreditationId('acc-prn-2')

      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0].amount).toBe(25.5)
      expect(result.transactions[0].entities[0].id).toBe('prn-456')
      expect(result.transactions[0].entities[0].type).toBe(
        WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.PRN_CREATED
      )
    })

    it('does nothing when no balance exists', async () => {
      await repository.deductAvailableBalanceForPrnCreation({
        accreditationId: 'acc-nonexistent',
        organisationId: 'org-1',
        prnId: 'prn-789',
        tonnage: 10,
        userId: 'user-123'
      })

      const result = await repository.findByAccreditationId('acc-nonexistent')
      expect(result).toBeNull()
    })

    it('increments version number', async ({ insertWasteBalance }) => {
      const wasteBalance = buildWasteBalance({
        accreditationId: 'acc-prn-3',
        organisationId: 'org-1',
        version: 5
      })

      await insertWasteBalance(wasteBalance)

      await repository.deductAvailableBalanceForPrnCreation({
        accreditationId: 'acc-prn-3',
        organisationId: 'org-1',
        prnId: 'prn-999',
        tonnage: 10,
        userId: 'user-456'
      })

      const result = await repository.findByAccreditationId('acc-prn-3')
      expect(result.version).toBe(6)
    })
  })
}
