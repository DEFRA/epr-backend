import { beforeEach, describe, expect } from 'vitest'
import { buildOrganisation } from './test-data.js'

export const testFindAllBySchemaVersionBehaviour = (it) => {
  describe('findAllBySchemaVersion', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    it('returns empty array when no organisations match the schema version', async () => {
      const org = buildOrganisation()
      await repository.insert(org)

      const result = await repository.findAllBySchemaVersion(99)

      expect(result).toEqual([])
    })

    it('returns all organisations matching the given schema version', async () => {
      const org1 = buildOrganisation()
      const org2 = buildOrganisation()
      const org3 = buildOrganisation()

      await Promise.all([org1, org2, org3].map((o) => repository.insert(o)))

      const result = await repository.findAllBySchemaVersion(3)

      expect(result).toHaveLength(3)
      expect(result.map((o) => o.id)).toEqual(
        expect.arrayContaining([org1.id, org2.id, org3.id])
      )

      expect(await repository.findAllBySchemaVersion(1)).toHaveLength(0)
    })

    it('returns empty array when no organisations exist', async () => {
      const result = await repository.findAllBySchemaVersion(2)

      expect(result).toEqual([])
    })
  })
}
