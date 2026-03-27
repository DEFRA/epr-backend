import { describe, beforeEach, expect } from 'vitest'
import { buildOverseasSite } from './test-data.js'

export const testFindByIdsBehaviour = (it) => {
  describe('findByIds', () => {
    let repository

    beforeEach(async ({ overseasSitesRepository }) => {
      repository = overseasSitesRepository
    })

    it('returns empty array when no ids provided', async () => {
      const result = await repository.findByIds([])

      expect(result).toStrictEqual([])
    })

    it('returns matching sites for given ids', async () => {
      const siteA = await repository.create(
        buildOverseasSite({ name: 'Site A' })
      )
      const siteB = await repository.create(
        buildOverseasSite({ name: 'Site B' })
      )
      await repository.create(buildOverseasSite({ name: 'Site C' }))

      const result = await repository.findByIds([siteA.id, siteB.id])

      expect(result).toHaveLength(2)
      const names = result.map((s) => s.name)
      expect(names).toContain('Site A')
      expect(names).toContain('Site B')
    })

    it('skips ids that do not exist', async () => {
      const site = await repository.create(
        buildOverseasSite({ name: 'Only One' })
      )

      const result = await repository.findByIds([
        site.id,
        '000000000000000000000000'
      ])

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Only One')
    })

    it('returns empty array when none of the ids exist', async () => {
      const result = await repository.findByIds([
        '000000000000000000000000',
        '000000000000000000000001'
      ])

      expect(result).toStrictEqual([])
    })
  })
}
