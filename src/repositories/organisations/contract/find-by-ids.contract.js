import { beforeEach, describe, expect } from 'vitest'
import { buildOrganisation } from './test-data.js'

export const testFindByIdsBehaviour = (it) => {
  describe('findByIds', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    it('returns empty array when given empty array', async () => {
      const result = await repository.findByIds([])

      expect(result).toEqual([])
    })

    it('throws error for invalid ID format', async () => {
      await expect(
        repository.findByIds(['invalid-id-format'])
      ).rejects.toThrow()
    })

    it('returns organisations matching the given IDs', async () => {
      const org1 = buildOrganisation()
      const org2 = buildOrganisation()
      const org3 = buildOrganisation()

      await Promise.all([org1, org2, org3].map((org) => repository.insert(org)))

      const result = await repository.findByIds([org1.id, org2.id])

      expect(result).toHaveLength(2)
      expect(result.map((o) => o.id)).toEqual(
        expect.arrayContaining([org1.id, org2.id])
      )
      expect(result[0].orgId).toBeDefined()
    })
  })
}
