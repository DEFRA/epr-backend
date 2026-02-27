import { describe, beforeEach, expect } from 'vitest'
import { buildOverseasSite } from './test-data.js'

export const testFindBehaviour = (it) => {
  describe('findById', () => {
    let repository

    beforeEach(async ({ overseasSitesRepository }) => {
      repository = overseasSitesRepository
    })

    it('returns null for non-existent id', async () => {
      const result = await repository.findById('000000000000000000000000')

      expect(result).toBeNull()
    })

    it('returns the site when found', async () => {
      const created = await repository.create(
        buildOverseasSite({ name: 'Find Me' })
      )

      const found = await repository.findById(created.id)

      expect(found).toBeTruthy()
      expect(found.name).toBe('Find Me')
    })
  })

  describe('findAll', () => {
    let repository

    beforeEach(async ({ overseasSitesRepository }) => {
      repository = overseasSitesRepository
    })

    it('returns empty array when no sites exist', async () => {
      const result = await repository.findAll()

      expect(result).toStrictEqual([])
    })

    it('returns all sites when no filter provided', async () => {
      await repository.create(buildOverseasSite({ name: 'Site A' }))
      await repository.create(buildOverseasSite({ name: 'Site B' }))

      const result = await repository.findAll()

      expect(result).toHaveLength(2)
      const names = result.map((s) => s.name)
      expect(names).toContain('Site A')
      expect(names).toContain('Site B')
    })

    it('filters by country when provided', async () => {
      await repository.create(
        buildOverseasSite({ name: 'Indian Site', country: 'India' })
      )
      await repository.create(
        buildOverseasSite({ name: 'Pakistan Site', country: 'Pakistan' })
      )

      const result = await repository.findAll({ country: 'India' })

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Indian Site')
    })

    it('filters by name with case-insensitive partial match', async () => {
      await repository.create(
        buildOverseasSite({ name: 'Acme Reprocessing Pvt Ltd' })
      )
      await repository.create(
        buildOverseasSite({ name: 'Globex Industries Ltd' })
      )

      const result = await repository.findAll({ name: 'acme' })

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Acme Reprocessing Pvt Ltd')
    })

    it('treats regex-special characters in name as literal text', async () => {
      await repository.create(
        buildOverseasSite({ name: 'Acme (Holdings) Ltd.' })
      )
      await repository.create(
        buildOverseasSite({ name: 'Acme Xholdings* Ltd' })
      )

      const result = await repository.findAll({ name: '(holdings)' })

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Acme (Holdings) Ltd.')
    })

    it('combines name and country filters', async () => {
      await repository.create(
        buildOverseasSite({
          name: 'Acme India',
          country: 'India'
        })
      )
      await repository.create(
        buildOverseasSite({
          name: 'Acme Pakistan',
          country: 'Pakistan'
        })
      )
      await repository.create(
        buildOverseasSite({
          name: 'Globex India',
          country: 'India'
        })
      )

      const result = await repository.findAll({
        name: 'acme',
        country: 'India'
      })

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Acme India')
    })
  })
}
