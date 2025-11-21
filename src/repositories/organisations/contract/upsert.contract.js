import { describe, beforeEach, expect } from 'vitest'
import { buildOrganisation } from './test-data.js'

export const testUpsertBehaviour = (it) => {
  describe('upsert', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    describe('insert behaviour', () => {
      it('inserts a new organisation when ID does not exist', async () => {
        const orgData = buildOrganisation()

        const result = await repository.upsert(orgData)

        expect(result.action).toBe('inserted')
        expect(result.id).toBe(orgData.id)

        const savedOrg = await repository.findById(orgData.id)
        expect(savedOrg.id).toBe(orgData.id)
        expect(savedOrg.orgId).toBe(orgData.orgId)
      })
    })

    describe('update behaviour', () => {
      it('updates an existing organisation and increments version when ID exists', async () => {
        const orgData = buildOrganisation({
          companyDetails: {
            name: 'Original Name',
            companiesHouseNumber: '12345678'
          }
        })

        await repository.insert(orgData)
        const afterInsert = await repository.findById(orgData.id)
        expect(afterInsert.version).toBe(1)

        const updatedData = {
          ...orgData,
          companyDetails: {
            ...orgData.companyDetails,
            name: 'Updated Name'
          }
        }

        const result = await repository.upsert(updatedData)

        expect(result.action).toBe('updated')
        expect(result.id).toBe(orgData.id)

        const afterUpsert = await repository.findById(orgData.id, 2)
        expect(afterUpsert.companyDetails.name).toBe('Updated Name')
        expect(afterUpsert.version).toBe(2)
      })

      it.skip('returns unchanged when upserting identical data', async () => {
        const orgData = buildOrganisation()

        await repository.insert(orgData)
        const afterInsert = await repository.findById(orgData.id)
        expect(afterInsert.version).toBe(1)

        const result = await repository.upsert(orgData)

        expect(result.action).toBe('unchanged')
        expect(result.id).toBe(orgData.id)

        const afterUpsert = await repository.findById(orgData.id)
        expect(afterUpsert.version).toBe(1)
      })
    })

    describe('validation', () => {
      it('rejects upsert with empty wasteProcessingTypes array', async () => {
        const invalidOrg = buildOrganisation({
          wasteProcessingTypes: []
        })

        await expect(repository.upsert(invalidOrg)).rejects.toThrow(
          'Invalid organisation data: wasteProcessingTypes: array.min'
        )
      })

      it('rejects upsert with missing required fields', async () => {
        const invalidOrg = buildOrganisation({
          submitterContactDetails: undefined
        })

        await expect(repository.upsert(invalidOrg)).rejects.toThrow(
          'Invalid organisation data: submitterContactDetails: any.required'
        )
      })
    })
  })
}
