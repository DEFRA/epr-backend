import { describe, beforeEach, expect } from 'vitest'
import { buildOverseasSite } from './test-data.js'

export const testDeleteByIdsBehaviour = (it) => {
  describe('deleteByIds', () => {
    let repository

    beforeEach(async ({ overseasSitesRepository }) => {
      repository = overseasSitesRepository
    })

    it('returns 0 when the input array is empty', async () => {
      const result = await repository.deleteByIds([])

      expect(result).toBe(0)
    })

    it('returns 0 when no sites match', async () => {
      await repository.create(buildOverseasSite({ name: 'Keep' }))

      const result = await repository.deleteByIds([
        '000000000000000000000000',
        '000000000000000000000001'
      ])

      expect(result).toBe(0)
      const all = await repository.findAll()
      expect(all).toHaveLength(1)
    })

    it('deletes matching sites and returns the count', async () => {
      const siteA = await repository.create(
        buildOverseasSite({ name: 'Site A' })
      )
      const siteB = await repository.create(
        buildOverseasSite({ name: 'Site B' })
      )

      const result = await repository.deleteByIds([siteA.id, siteB.id])

      expect(result).toBe(2)
      expect(await repository.findById(siteA.id)).toBeNull()
      expect(await repository.findById(siteB.id)).toBeNull()
    })

    it('does not delete sites whose id is not in the list', async () => {
      const siteA = await repository.create(
        buildOverseasSite({ name: 'Delete me' })
      )
      const siteB = await repository.create(
        buildOverseasSite({ name: 'Keep me' })
      )

      const result = await repository.deleteByIds([siteA.id])

      expect(result).toBe(1)
      const remaining = await repository.findById(siteB.id)
      expect(remaining).not.toBeNull()
      expect(remaining.name).toBe('Keep me')
    })
  })
}
