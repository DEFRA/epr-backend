import crypto from 'node:crypto'
import { beforeEach, describe, expect } from 'vitest'
import { buildOrganisation, prepareOrgUpdate } from './test-data.js'

/**
 * Builds a valid linkedDefraOrganisation object that passes schema validation
 * @param {string} orgId - The Defra organisation ID (UUID)
 * @param {string} orgName - The organisation name
 * @returns {Object} Valid linkedDefraOrganisation object
 */
const buildLinkedDefraOrg = (orgId, orgName) => ({
  orgId,
  orgName,
  linkedBy: {
    email: 'linker@example.com',
    id: crypto.randomUUID()
  },
  linkedAt: new Date().toISOString()
})

export const testFindByLinkedDefraOrgIdBehaviour = (it) => {
  describe('findByLinkedDefraOrgId', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    it('returns undefined when no organisation is linked to the Defra org ID', async () => {
      const result = await repository.findByLinkedDefraOrgId(
        crypto.randomUUID()
      )

      expect(result).toBeUndefined()
    })

    it('returns undefined when organisations exist but none are linked', async () => {
      const org = buildOrganisation()
      await repository.insert(org)

      const result = await repository.findByLinkedDefraOrgId(
        crypto.randomUUID()
      )

      expect(result).toBeUndefined()
    })

    it('returns the organisation linked to the specified Defra org ID', async () => {
      const defraOrgId = crypto.randomUUID()
      const linkedDefraOrganisation = buildLinkedDefraOrg(
        defraOrgId,
        'Test Defra Org'
      )
      const org = buildOrganisation({ linkedDefraOrganisation })
      await repository.insert(org)

      const result = await repository.findByLinkedDefraOrgId(defraOrgId)

      expect(result).toMatchObject({
        id: org.id,
        orgId: org.orgId,
        linkedDefraOrganisation: {
          orgId: defraOrgId,
          orgName: 'Test Defra Org'
        }
      })
    })

    it('returns only the organisation matching the Defra org ID when multiple exist', async () => {
      const defraOrgId1 = crypto.randomUUID()
      const defraOrgId2 = crypto.randomUUID()

      const org1 = buildOrganisation({
        linkedDefraOrganisation: buildLinkedDefraOrg(defraOrgId1, 'Org One')
      })
      const org2 = buildOrganisation({
        linkedDefraOrganisation: buildLinkedDefraOrg(defraOrgId2, 'Org Two')
      })
      const org3 = buildOrganisation() // Not linked

      await Promise.all([org1, org2, org3].map((org) => repository.insert(org)))

      const result = await repository.findByLinkedDefraOrgId(defraOrgId2)

      expect(result).toMatchObject({
        id: org2.id,
        linkedDefraOrganisation: {
          orgId: defraOrgId2
        }
      })
    })

    it('eventually returns organisation after linkedDefraOrganisation is added', async () => {
      const org = buildOrganisation()
      await repository.insert(org)

      const defraOrgId = crypto.randomUUID()
      const orgAfterInsert = await repository.findById(org.id)
      const linkedDefraOrganisation = buildLinkedDefraOrg(
        defraOrgId,
        'Newly Linked Org'
      )
      await repository.replace(
        org.id,
        orgAfterInsert.version,
        prepareOrgUpdate(orgAfterInsert, { linkedDefraOrganisation })
      )

      // Wait for eventual consistency - in production, replicas may lag behind primary
      // Retry up to 10 times with 50ms delay (500ms total max wait)
      let result
      for (let i = 0; i < 10; i++) {
        result = await repository.findByLinkedDefraOrgId(defraOrgId)
        if (result) break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }

      expect(result).toMatchObject({
        id: org.id,
        linkedDefraOrganisation: {
          orgId: defraOrgId
        }
      })
    })
  })
}
