import { describe, beforeEach, expect } from 'vitest'
import { buildOverseasSite } from './test-data.js'

export const testDataIsolation = (it) => {
  describe('data isolation', () => {
    let repository

    beforeEach(async ({ overseasSitesRepository }) => {
      repository = overseasSitesRepository
    })

    it('returns cloned data from findById that cannot mutate storage', async () => {
      const created = await repository.create(buildOverseasSite())

      const retrieved = await repository.findById(created.id)
      retrieved.address.line1 = 'mutated'

      const retrievedAgain = await repository.findById(created.id)
      expect(retrievedAgain.address.line1).toBe(created.address.line1)
    })

    it('returns cloned data from create that cannot mutate storage', async () => {
      const created = await repository.create(buildOverseasSite())
      const originalLine1 = created.address.line1

      created.address.line1 = 'mutated'

      const retrieved = await repository.findById(created.id)
      expect(retrieved.address.line1).toBe(originalLine1)
    })
  })
}
