import { describe, beforeEach, expect } from 'vitest'
import { buildOrganisation } from './test-data.js'
import { STATUS } from '#domain/organisations.js'

export const testFindBehaviour = (it) => {
  describe('find', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    describe('findById', () => {
      it('rejects invalid ObjectId format', async () => {
        await expect(repository.findById('invalid-id-format')).rejects.toThrow(
          'Organisation with id invalid-id-format not found'
        )
      })

      it('returns 404 when ID not found', async () => {
        await expect(
          repository.findById('507f1f77bcf86cd799439011')
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 404 }
        })
      })

      it('retrieves an organisation by ID after insert', async () => {
        const orgData = buildOrganisation()
        await repository.insert(orgData)

        const result = await repository.findById(orgData.id)

        expect(result).toMatchObject({
          id: orgData.id,
          orgId: orgData.orgId,
          wasteProcessingTypes: orgData.wasteProcessingTypes,
          reprocessingNations: orgData.reprocessingNations,
          businessType: orgData.businessType,
          status: STATUS.CREATED,
          submittedToRegulator: orgData.submittedToRegulator,
          submitterContactDetails: orgData.submitterContactDetails,
          companyDetails: orgData.companyDetails
        })
      })

      it('does not return organisations with different IDs', async () => {
        const org1 = buildOrganisation()
        const org2 = buildOrganisation()

        await Promise.all([org1, org2].map((org) => repository.insert(org)))

        const result = await repository.findById(org1.id)

        expect(result.id).toBe(org1.id)
        expect(result.orgId).toBe(org1.orgId)
      })

      it('throws timeout error when minimumVersion never arrives', async () => {
        const orgData = buildOrganisation()
        await repository.insert(orgData)

        // Request a version that will never exist
        await expect(
          repository.findById(orgData.id, 999)
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 500 },
          message: 'Consistency timeout waiting for minimum version'
        })
      })

      it('waits for minimumVersion and returns organisation when version arrives', async () => {
        const orgData = buildOrganisation()
        await repository.insert(orgData)

        // Update to create version 2
        await repository.update(orgData.id, 1, {
          wasteProcessingTypes: ['exporter']
        })

        // Request with minimumVersion=2 - should retry until version 2 appears
        const result = await repository.findById(orgData.id, 2)

        expect(result).toMatchObject({
          id: orgData.id,
          orgId: orgData.orgId,
          wasteProcessingTypes: ['exporter'],
          version: 2
        })
      })

      it('throws timeout when waiting for non-existent document with minimumVersion', async () => {
        const { ObjectId } = await import('mongodb')
        const nonExistentId = new ObjectId().toString()

        // Request minimumVersion for document that doesn't exist - should retry then timeout
        await expect(
          repository.findById(nonExistentId, 1)
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 404 },
          message: `Organisation with id ${nonExistentId} not found`
        })
      })
    })

    describe('findAll', () => {
      it('returns empty array when no organisations exist', async () => {
        const result = await repository.findAll()

        expect(result).toEqual([])
      })

      it('returns all organisations', async () => {
        const org1 = buildOrganisation()
        const org2 = buildOrganisation()
        const org3 = buildOrganisation()

        await Promise.all(
          [org1, org2, org3].map((org) => repository.insert(org))
        )

        const result = await repository.findAll()

        expect(result).toHaveLength(3)
        expect(result.map((o) => o.orgId)).toEqual(
          expect.arrayContaining([org1.orgId, org2.orgId, org3.orgId])
        )
      })
    })
  })
}
