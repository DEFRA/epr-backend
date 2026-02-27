import { describe, beforeEach, expect } from 'vitest'
import { buildOverseasSite } from './test-data.js'

export const testRemoveBehaviour = (it) => {
  describe('remove', () => {
    let repository

    beforeEach(async ({ overseasSitesRepository }) => {
      repository = overseasSitesRepository
    })

    it('returns false when removing non-existent site', async () => {
      const result = await repository.remove('000000000000000000000000')

      expect(result).toBe(false)
    })

    it('returns true when removing existing site', async () => {
      const created = await repository.create(buildOverseasSite())

      const result = await repository.remove(created.id)

      expect(result).toBe(true)
    })

    it('makes the site unfindable after removal', async () => {
      const created = await repository.create(buildOverseasSite())

      await repository.remove(created.id)

      const found = await repository.findById(created.id)
      expect(found).toBeNull()
    })

    it('excludes removed sites from findAll', async () => {
      const site1 = await repository.create(buildOverseasSite({ name: 'Keep' }))
      const site2 = await repository.create(
        buildOverseasSite({ name: 'Remove' })
      )

      await repository.remove(site2.id)

      const all = await repository.findAll()
      expect(all).toHaveLength(1)
      expect(all[0].id).toBe(site1.id)
    })
  })
}
