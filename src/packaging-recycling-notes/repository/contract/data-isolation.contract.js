import { describe, beforeEach, expect } from 'vitest'
import { buildDraftPrn } from './test-data.js'

export const testDataIsolation = (it) => {
  describe('data isolation', () => {
    let repository

    beforeEach(async ({ prnRepository }) => {
      repository = prnRepository
    })

    it('returns cloned data from findById that cannot mutate storage', async () => {
      const created = await repository.create(buildDraftPrn())

      const retrieved = await repository.findById(created.id)
      retrieved.accreditationId = 'mutated'

      const retrievedAgain = await repository.findById(created.id)
      expect(retrievedAgain.accreditationId).toBe(created.accreditationId)
    })

    it('returns cloned data from create that cannot mutate storage', async () => {
      const created = await repository.create(buildDraftPrn())
      const originalAccreditationId = created.accreditationId

      created.accreditationId = 'mutated'

      const retrieved = await repository.findById(created.id)
      expect(retrieved.accreditationId).toBe(originalAccreditationId)
    })
  })
}
