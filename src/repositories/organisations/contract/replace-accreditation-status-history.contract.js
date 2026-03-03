import { beforeEach, describe, expect } from 'vitest'
import { buildOrganisation } from './test-data.js'
import { ObjectId } from 'mongodb'

export const testReplaceAccreditationStatusHistoryBehaviour = (it) => {
  describe('replaceAccreditationStatusHistory', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    it('overwrites the accreditation statusHistory', async () => {
      const orgData = buildOrganisation()
      await repository.insert(orgData)

      const accreditationId = orgData.accreditations[0].id
      const newStatusHistory = [
        { status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2025-01-02T00:00:00.000Z' }
      ]

      await repository.replaceAccreditationStatusHistory(
        orgData.id,
        accreditationId,
        1,
        newStatusHistory
      )

      const result = await repository.findById(orgData.id, 2)
      const accreditation = result.accreditations.find(
        (a) => a.id === accreditationId
      )

      expect(accreditation.statusHistory).toHaveLength(2)
      expect(accreditation.statusHistory[0].status).toBe('created')
      expect(accreditation.statusHistory[1].status).toBe('approved')
      expect(result.version).toBe(2)
    })

    it('throws not found when organisation does not exist', async () => {
      const nonExistentId = new ObjectId().toString()

      await expect(
        repository.replaceAccreditationStatusHistory(
          nonExistentId,
          'some-acc-id',
          1,
          [{ status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' }]
        )
      ).rejects.toThrow()
    })

    it('throws when version does not match', async () => {
      const orgData = buildOrganisation()
      await repository.insert(orgData)

      await expect(
        repository.replaceAccreditationStatusHistory(
          orgData.id,
          orgData.accreditations[0].id,
          999,
          [{ status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' }]
        )
      ).rejects.toThrow()
    })

    it('throws when accreditation does not exist', async () => {
      const orgData = buildOrganisation()
      await repository.insert(orgData)

      const nonExistentAccId = new ObjectId().toString()

      await expect(
        repository.replaceAccreditationStatusHistory(
          orgData.id,
          nonExistentAccId,
          1,
          [{ status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' }]
        )
      ).rejects.toThrow()
    })
  })
}
