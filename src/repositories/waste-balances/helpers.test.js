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
      expect(result.id).toBeDefined()
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
  })
})
