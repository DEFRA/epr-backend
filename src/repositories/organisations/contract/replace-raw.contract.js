import { beforeEach, describe, expect } from 'vitest'
import { buildOrganisation } from './test-data.js'

export const testReplaceRawBehaviour = (it) => {
  describe('replaceRaw', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    it('writes document directly without status history processing', async () => {
      const orgData = buildOrganisation()
      await repository.insert(orgData)

      const current = await repository.findById(orgData.id)

      const customStatusHistory = [
        { status: 'created', updatedAt: '2024-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-01-01T00:00:00.000Z' }
      ]

      const { id: _, version: _v, ...document } = current
      document.statusHistory = customStatusHistory

      await repository.replaceRaw(orgData.id, current.version, document)

      const result = await repository.findById(orgData.id, current.version + 1)
      expect(result.version).toBe(current.version + 1)
      expect(result.statusHistory).toHaveLength(2)
      expect(result.statusHistory[1].status).toBe('approved')
      expect(result.status).toBe('approved')
    })

    it('throws conflict on version mismatch', async () => {
      const orgData = buildOrganisation()
      await repository.insert(orgData)

      const current = await repository.findById(orgData.id)
      const { id: _, version: _v, ...document } = current

      await expect(
        repository.replaceRaw(orgData.id, 999, document)
      ).rejects.toThrow(/conflict/i)
    })

    it('throws not found for non-existent id', async () => {
      await expect(
        repository.replaceRaw('000000000000000000000000', 1, {
          statusHistory: [{ status: 'created', updatedAt: new Date() }]
        })
      ).rejects.toThrow()
    })
  })
}
