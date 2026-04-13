import { describe, beforeEach, expect } from 'vitest'
import { buildWasteBalance } from './test-data.js'

export const testDeleteByAccreditationIdsBehaviour = (it) => {
  describe('deleteByAccreditationIds', () => {
    let repository

    beforeEach(async ({ wasteBalancesRepository }) => {
      repository = await wasteBalancesRepository()
    })

    it('deletes all waste balances matching the given accreditationIds and returns the count', async ({
      insertWasteBalances
    }) => {
      const balance1 = buildWasteBalance({ accreditationId: 'acc-1' })
      const balance2 = buildWasteBalance({ accreditationId: 'acc-2' })

      await insertWasteBalances([balance1, balance2])

      const deletedCount = await repository.deleteByAccreditationIds([
        'acc-1',
        'acc-2'
      ])

      expect(deletedCount).toBe(2)

      const remaining = await repository.findByAccreditationIds([
        'acc-1',
        'acc-2'
      ])
      expect(remaining).toEqual([])
    })

    it('returns 0 when no balances match', async ({ insertWasteBalance }) => {
      const wasteBalance = buildWasteBalance({ accreditationId: 'acc-1' })
      await insertWasteBalance(wasteBalance)

      const deletedCount = await repository.deleteByAccreditationIds([
        'acc-nonexistent'
      ])

      expect(deletedCount).toBe(0)

      const remaining = await repository.findByAccreditationIds(['acc-1'])
      expect(remaining).toHaveLength(1)
    })

    it('returns 0 when the input array is empty', async ({
      insertWasteBalance
    }) => {
      const wasteBalance = buildWasteBalance({ accreditationId: 'acc-1' })
      await insertWasteBalance(wasteBalance)

      const deletedCount = await repository.deleteByAccreditationIds([])

      expect(deletedCount).toBe(0)

      const remaining = await repository.findByAccreditationIds(['acc-1'])
      expect(remaining).toHaveLength(1)
    })

    it('does not delete balances whose accreditationId is not in the list', async ({
      insertWasteBalances
    }) => {
      const balance1 = buildWasteBalance({ accreditationId: 'acc-1' })
      const balance2 = buildWasteBalance({ accreditationId: 'acc-2' })
      const balance3 = buildWasteBalance({ accreditationId: 'acc-3' })

      await insertWasteBalances([balance1, balance2, balance3])

      const deletedCount = await repository.deleteByAccreditationIds([
        'acc-1',
        'acc-3'
      ])

      expect(deletedCount).toBe(2)

      const remaining = await repository.findByAccreditationIds([
        'acc-1',
        'acc-2',
        'acc-3'
      ])
      expect(remaining).toHaveLength(1)
      expect(remaining[0].accreditationId).toBe('acc-2')
    })
  })
}
