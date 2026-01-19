import { beforeEach, describe, expect } from 'vitest'
import {
  buildOrganisation,
  getValidDateRange,
  prepareOrgUpdate
} from './test-data.js'
import { REG_ACC_STATUS, REPROCESSING_TYPE } from '#domain/organisations/model.js'

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
          status: REG_ACC_STATUS.CREATED,
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
        const orgAfterInsert = await repository.findById(orgData.id)
        const updatePayload = prepareOrgUpdate(orgAfterInsert, {
          wasteProcessingTypes: ['exporter']
        })
        await repository.replace(orgData.id, 1, updatePayload)

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

    describe('findByLinkedDefraOrgId', () => {
      const DEFRA_ORG_ID_1 = '550e8400-e29b-41d4-a716-446655440001'
      const DEFRA_ORG_ID_2 = '550e8400-e29b-41d4-a716-446655440002'
      const DEFRA_ORG_ID_3 = '550e8400-e29b-41d4-a716-446655440003'
      const USER_ID_1 = '660e8400-e29b-41d4-a716-446655440001'
      const USER_ID_2 = '660e8400-e29b-41d4-a716-446655440002'
      const USER_ID_3 = '660e8400-e29b-41d4-a716-446655440003'

      it('returns null when no organisations exist', async () => {
        const result = await repository.findByLinkedDefraOrgId(DEFRA_ORG_ID_1)

        expect(result).toBeNull()
      })

      it('returns null when no organisation is linked to the given defra org ID', async () => {
        const unlinkedOrg = buildOrganisation()
        const orgLinkedToDifferentDefraId = buildOrganisation({
          linkedDefraOrganisation: {
            orgId: DEFRA_ORG_ID_2,
            orgName: 'Different Org',
            linkedBy: { email: 'test@example.com', id: USER_ID_1 },
            linkedAt: new Date().toISOString()
          }
        })
        await Promise.all(
          [unlinkedOrg, orgLinkedToDifferentDefraId].map((org) =>
            repository.insert(org)
          )
        )

        const result = await repository.findByLinkedDefraOrgId(DEFRA_ORG_ID_1)

        expect(result).toBeNull()
      })

      it('returns the organisation linked to the given defra org ID', async () => {
        const linkedOrg = buildOrganisation({
          linkedDefraOrganisation: {
            orgId: DEFRA_ORG_ID_1,
            orgName: 'Target Org',
            linkedBy: { email: 'linker@example.com', id: USER_ID_1 },
            linkedAt: new Date().toISOString()
          }
        })
        await repository.insert(linkedOrg)

        const result = await repository.findByLinkedDefraOrgId(DEFRA_ORG_ID_1)

        expect(result).not.toBeNull()
        expect(result.id).toBe(linkedOrg.id)
        expect(result.linkedDefraOrganisation.orgId).toBe(DEFRA_ORG_ID_1)
      })

      it('returns only the linked organisation when multiple organisations exist', async () => {
        const unlinkedOrg = buildOrganisation()

        const orgLinkedToDifferentDefraId = buildOrganisation({
          linkedDefraOrganisation: {
            orgId: DEFRA_ORG_ID_2,
            orgName: 'Other Org',
            linkedBy: { email: 'other@example.com', id: USER_ID_2 },
            linkedAt: new Date().toISOString()
          }
        })

        const orgLinkedToTargetDefraId = buildOrganisation({
          linkedDefraOrganisation: {
            orgId: DEFRA_ORG_ID_3,
            orgName: 'Target Org',
            linkedBy: { email: 'target@example.com', id: USER_ID_3 },
            linkedAt: new Date().toISOString()
          }
        })

        await Promise.all(
          [unlinkedOrg, orgLinkedToDifferentDefraId, orgLinkedToTargetDefraId].map(
            (org) => repository.insert(org)
          )
        )

        const result = await repository.findByLinkedDefraOrgId(DEFRA_ORG_ID_3)

        expect(result).not.toBeNull()
        expect(result.id).toBe(orgLinkedToTargetDefraId.id)
        expect(result.linkedDefraOrganisation.orgId).toBe(DEFRA_ORG_ID_3)
      })

      it('returns organisation with computed status field', async () => {
        const linkedOrg = buildOrganisation({
          linkedDefraOrganisation: {
            orgId: DEFRA_ORG_ID_1,
            orgName: 'Target Org',
            linkedBy: { email: 'linker@example.com', id: USER_ID_1 },
            linkedAt: new Date().toISOString()
          }
        })
        await repository.insert(linkedOrg)

        const result = await repository.findByLinkedDefraOrgId(DEFRA_ORG_ID_1)

        expect(result.status).toBe('created')
      })
    })

    describe('findAllLinkableForUser', () => {
      const INITIAL_USER_EMAIL = 'initial.user@example.com'
      const OTHER_USER_EMAIL = 'other.user@example.com'
      const DEFRA_ORG_ID = '550e8400-e29b-41d4-a716-446655440001'
      const USER_ID = '660e8400-e29b-41d4-a716-446655440001'
      const { VALID_FROM, VALID_TO } = getValidDateRange()

      const buildOrgWithSubmitter = (email, overrides = {}) =>
        buildOrganisation({
          submitterContactDetails: {
            fullName: 'Test User',
            email,
            phone: '01onal234567',
            jobTitle: 'Manager'
          },
          ...overrides
        })

      const approveOrg = async (org) => {
        const inserted = await repository.findById(org.id)
        const updatePayload = prepareOrgUpdate(inserted, {
          status: REG_ACC_STATUS.APPROVED,
          registrations: [
            {
              ...inserted.registrations[0],
              status: REG_ACC_STATUS.APPROVED,
              registrationNumber: 'REG12345',
              validFrom: VALID_FROM,
              validTo: VALID_TO,
              reprocessingType: REPROCESSING_TYPE.INPUT
            }
          ]
        })
        await repository.replace(org.id, 1, updatePayload)
        // Wait for the update to propagate to ensure stale cache is synced
        await repository.findById(org.id, 2)
      }

      it('returns empty array when no organisations exist', async () => {
        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result).toEqual([])
      })

      it('returns empty array when no organisations match criteria', async () => {
        const orgWithDifferentUser = buildOrgWithSubmitter(OTHER_USER_EMAIL)
        await repository.insert(orgWithDifferentUser)
        await approveOrg(orgWithDifferentUser)

        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result).toEqual([])
      })

      it('returns approved unlinked organisations where user is initial user', async () => {
        const matchingOrg = buildOrgWithSubmitter(INITIAL_USER_EMAIL)
        await repository.insert(matchingOrg)
        await approveOrg(matchingOrg)

        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(matchingOrg.id)
      })

      it('excludes linked organisations', async () => {
        const linkedOrg = buildOrgWithSubmitter(INITIAL_USER_EMAIL, {
          linkedDefraOrganisation: {
            orgId: DEFRA_ORG_ID,
            orgName: 'Linked Org',
            linkedBy: { email: 'linker@example.com', id: USER_ID },
            linkedAt: new Date().toISOString()
          }
        })
        await repository.insert(linkedOrg)
        await approveOrg(linkedOrg)

        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result).toEqual([])
      })

      it('excludes organisations that are not approved', async () => {
        const createdOrg = buildOrgWithSubmitter(INITIAL_USER_EMAIL)
        await repository.insert(createdOrg)
        // Don't approve - leave as 'created'

        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result).toEqual([])
      })

      it('matches email case-insensitively', async () => {
        const matchingOrg = buildOrgWithSubmitter('Initial.User@Example.COM')
        await repository.insert(matchingOrg)
        await approveOrg(matchingOrg)

        const result =
          await repository.findAllLinkableForUser('initial.user@example.com')

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(matchingOrg.id)
      })

      it('returns multiple matching organisations', async () => {
        const matchingOrg1 = buildOrgWithSubmitter(INITIAL_USER_EMAIL)
        const matchingOrg2 = buildOrgWithSubmitter(INITIAL_USER_EMAIL)
        const nonMatchingOrg = buildOrgWithSubmitter(OTHER_USER_EMAIL)

        await repository.insert(matchingOrg1)
        await repository.insert(matchingOrg2)
        await repository.insert(nonMatchingOrg)

        await approveOrg(matchingOrg1)
        await approveOrg(matchingOrg2)
        await approveOrg(nonMatchingOrg)

        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result).toHaveLength(2)
        expect(result.map((o) => o.id)).toEqual(
          expect.arrayContaining([matchingOrg1.id, matchingOrg2.id])
        )
      })

      it('returns organisations with computed status field', async () => {
        const matchingOrg = buildOrgWithSubmitter(INITIAL_USER_EMAIL)
        await repository.insert(matchingOrg)
        await approveOrg(matchingOrg)

        const result =
          await repository.findAllLinkableForUser(INITIAL_USER_EMAIL)

        expect(result[0].status).toBe(REG_ACC_STATUS.APPROVED)
      })
    })
  })
}
