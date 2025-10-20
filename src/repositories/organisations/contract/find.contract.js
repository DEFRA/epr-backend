import { buildOrganisation } from './test-data.js'
import { STATUS } from '#domain/organisations.js'

export const testFindBehaviour = (repositoryFactory) => {
  describe('find', () => {
    let repository

    beforeEach(async () => {
      repository = await repositoryFactory()
    })

    describe('findById', () => {
      it('rejects invalid ObjectId format', async () => {
        await expect(repository.findById('invalid-id-format')).rejects.toThrow(
          /id must be a valid MongoDB ObjectId/
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
        const orgData = buildOrganisation({ orgId: 1001 })
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
        const org1 = buildOrganisation({ orgId: 2001 })
        const org2 = buildOrganisation({ orgId: 2002 })

        await Promise.all([org1, org2].map((org) => repository.insert(org)))

        const result = await repository.findById(org1.id)

        expect(result.id).toBe(org1.id)
        expect(result.orgId).toBe(2001)
      })
    })

    describe('findAll', () => {
      it('returns empty array when no organisations exist', async () => {
        const result = await repository.findAll()

        expect(result).toEqual([])
      })

      it('returns all organisations', async () => {
        const org1 = buildOrganisation({ orgId: 3001 })
        const org2 = buildOrganisation({ orgId: 3002 })
        const org3 = buildOrganisation({ orgId: 3003 })

        await Promise.all(
          [org1, org2, org3].map((org) => repository.insert(org))
        )

        const result = await repository.findAll()

        expect(result).toHaveLength(3)
        expect(result.map((o) => o.orgId)).toEqual(
          expect.arrayContaining([3001, 3002, 3003])
        )
      })
    })
  })
}
