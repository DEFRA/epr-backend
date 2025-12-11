import { describe, it, expect, vi } from 'vitest'
import {
  findOrCreateWasteBalance,
  performUpdateWasteBalanceTransactions
} from './helpers.js'

describe('src/repositories/waste-balances/helpers.js', () => {
  describe('findOrCreateWasteBalance', () => {
    it('should return existing balance if found', async () => {
      const mockBalance = { id: 'balance-1' }
      const findBalance = vi.fn().mockResolvedValue(mockBalance)

      const result = await findOrCreateWasteBalance({
        findBalance,
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        shouldCreate: true
      })

      expect(result).toBe(mockBalance)
      expect(findBalance).toHaveBeenCalledWith('acc-1')
    })

    it('should create new balance if not found and shouldCreate is true', async () => {
      const findBalance = vi.fn().mockResolvedValue(null)

      const result = await findOrCreateWasteBalance({
        findBalance,
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        shouldCreate: true
      })

      expect(result).toEqual(
        expect.objectContaining({
          accreditationId: 'acc-1',
          organisationId: 'org-1',
          transactions: [],
          amount: 0,
          availableAmount: 0,
          version: 0,
          schemaVersion: 1
        })
      )
      expect(result._id).toBeDefined()
    })

    it('should return null if not found and shouldCreate is false', async () => {
      const findBalance = vi.fn().mockResolvedValue(null)

      const result = await findOrCreateWasteBalance({
        findBalance,
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        shouldCreate: false
      })

      expect(result).toBeNull()
    })
  })

  describe('performUpdateWasteBalanceTransactions', () => {
    it('should return early if wasteRecords is empty', async () => {
      const result = await performUpdateWasteBalanceTransactions({
        wasteRecords: [],
        accreditationId: 'acc-1',
        dependencies: {
          organisationsRepository: {}
        },
        findBalance: vi.fn(),
        saveBalance: vi.fn()
      })

      expect(result).toBeUndefined()
    })

    // To cover the unreachable line 96, we need to mock findOrCreateWasteBalance
    // But we can't easily mock an internal function call within the same module in ES modules without some tricks or refactoring.
    // However, looking at the code:
    // const wasteBalance = await findOrCreateWasteBalance(...)
    // if (!wasteBalance) { return }
    //
    // Since we established that findOrCreateWasteBalance is called with shouldCreate: true, it always returns a balance.
    // So line 96 is indeed unreachable in the current implementation of performUpdateWasteBalanceTransactions.
    //
    // If I want to cover it, I would need to simulate a case where findOrCreateWasteBalance returns null even with shouldCreate: true?
    // No, createNewWasteBalance always returns an object.
    //
    // Maybe I should remove the unreachable code?
    // Or maybe I should just accept that it's defensive coding.
    //
    // If I really want to test it, I can try to pass a wasteRecord that makes shouldCreate false?
    // shouldCreate: wasteRecords.length > 0
    // But we return early if wasteRecords.length === 0.
    // So shouldCreate is always true.
    //
    // So line 96 is technically dead code.
    //
    // Let's see if I can just remove it?
    // "if (!wasteBalance) { return }"
    //
    // If I remove it, I rely on findOrCreateWasteBalance always returning something.
    //
    // Let's try to run the coverage with the new test file first.
  })
})
