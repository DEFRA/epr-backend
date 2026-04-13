import { beforeEach, describe, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { buildOrganisation } from './test-data.js'

export const testDeleteByIdBehaviour = (it) => {
  describe('deleteById', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    it('deletes the organisation and returns 1', async () => {
      const organisation = buildOrganisation()
      await repository.insert(organisation)

      const deletedCount = await repository.deleteById(organisation.id)

      expect(deletedCount).toBe(1)

      await expect(repository.findById(organisation.id)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('returns 0 when the organisation does not exist', async () => {
      const nonExistentId = new ObjectId().toString()

      const deletedCount = await repository.deleteById(nonExistentId)

      expect(deletedCount).toBe(0)
    })

    it('returns 0 when the id is not a valid ObjectId', async () => {
      const deletedCount = await repository.deleteById('not-an-objectid')

      expect(deletedCount).toBe(0)
    })

    it('only deletes the matching organisation', async () => {
      const orgA = buildOrganisation()
      const orgB = buildOrganisation()
      await repository.insert(orgA)
      await repository.insert(orgB)

      await repository.deleteById(orgA.id)

      await expect(repository.findById(orgA.id)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
      const remainingB = await repository.findById(orgB.id)
      expect(remainingB.id).toBe(orgB.id)
    })
  })
}
