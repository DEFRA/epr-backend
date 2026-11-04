import { describe, beforeEach, expect } from 'vitest'
import { buildOverseasSite } from './test-data.js'

export const testFindBehaviour = (it) => {
  describe('findById', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ overseasSitesRepository: import('../port.js').OverseasSitesRepository }} */ {
          overseasSitesRepository
        }
      ) => {
        repository = overseasSitesRepository
      }
    )

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

    beforeEach(
      async (
        /** @type {{ overseasSitesRepository: import('../port.js').OverseasSitesRepository }} */ {
          overseasSitesRepository
        }
      ) => {
        repository = overseasSitesRepository
      }
    )

    it('returns empty array when no sites exist', async () => {
      const result = await repository.findAll()

      expect(result).toStrictEqual([])
    })

    it('returns all sites', async () => {
      await repository.create(buildOverseasSite({ name: 'Site A' }))
      await repository.create(buildOverseasSite({ name: 'Site B' }))

      const result = await repository.findAll()

      expect(result).toHaveLength(2)
      const names = result.map((s) => s.name)
      expect(names).toContain('Site A')
      expect(names).toContain('Site B')
    })
  })
}
