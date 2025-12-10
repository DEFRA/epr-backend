import { describe, beforeEach, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { buildOrganisation, buildAccreditation } from './test-data.js'

export const testFindAccreditationByIdBehaviour = (it) => {
  describe('findAccreditationById', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    it('returns accreditation when both organisation ID and accreditation ID are valid', async () => {
      const accreditation1 = buildAccreditation({
        accreditationNumber: 'ACC111111'
      })

      const accreditation2 = buildAccreditation({
        accreditationNumber: 'ACC222222',
        material: 'plastic',
        wasteProcessingType: 'reprocessor',
        glassRecyclingProcess: undefined
      })

      const org = buildOrganisation({
        accreditations: [accreditation1, accreditation2]
      })

      await repository.insert(org)

      const result = await repository.findAccreditationById(
        org.id,
        accreditation1.id
      )

      expect(result).toMatchObject({
        id: accreditation1.id,
        accreditationNumber: accreditation1.accreditationNumber,
        material: accreditation1.material,
        wasteProcessingType: accreditation1.wasteProcessingType
      })
    })

    it('throws NotFound when organisation ID does not exist', async () => {
      const accreditation = buildAccreditation()
      const org = buildOrganisation({
        accreditations: [accreditation]
      })

      await repository.insert(org)

      const nonExistentOrgId = new ObjectId().toString()

      await expect(
        repository.findAccreditationById(nonExistentOrgId, accreditation.id)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('throws NotFound when accreditation ID does not exist in the organisation', async () => {
      const accreditation = buildAccreditation()
      const org = buildOrganisation({
        accreditations: [accreditation]
      })

      await repository.insert(org)

      const nonExistentAccreditationId = new ObjectId().toString()

      await expect(
        repository.findAccreditationById(org.id, nonExistentAccreditationId)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('throws NotFound when organisation has no accreditations', async () => {
      const org = buildOrganisation({
        accreditations: []
      })

      await repository.insert(org)

      const nonExistentAccreditationId = new ObjectId().toString()

      await expect(
        repository.findAccreditationById(org.id, nonExistentAccreditationId)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('throws 404 for invalid organisation ID format', async () => {
      await expect(
        repository.findAccreditationById('invalid-id', 'acc-123')
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('throws timeout error when minimumOrgVersion never arrives', async () => {
      const accreditation = buildAccreditation()

      const org = buildOrganisation({
        accreditations: [accreditation]
      })

      await repository.insert(org)

      // Request a version that will never exist
      await expect(
        repository.findAccreditationById(org.id, accreditation.id, 999)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 500 },
        message: 'Consistency timeout waiting for minimum version'
      })
    })

    it('waits for minimumOrgVersion and returns accreditation when version arrives', async () => {
      const accreditation = buildAccreditation()

      const org = buildOrganisation({
        accreditations: [accreditation]
      })

      await repository.insert(org)

      // Update to create version 2
      await repository.update(org.id, 1, {
        wasteProcessingTypes: ['exporter']
      })

      // Request with minimumOrgVersion=2 - should retry until version 2 appears
      const result = await repository.findAccreditationById(
        org.id,
        accreditation.id,
        2
      )

      expect(result).toMatchObject({
        id: accreditation.id,
        accreditationNumber: accreditation.accreditationNumber,
        material: accreditation.material
      })
    })
  })
}
