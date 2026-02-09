import crypto from 'node:crypto'
import { beforeEach, describe, expect } from 'vitest'
import { buildOrganisation } from './test-data.js'

const buildLinkedDefraOrg = (orgId, orgName) => ({
  orgId,
  orgName,
  linkedBy: {
    email: 'linker@example.com',
    id: crypto.randomUUID()
  },
  linkedAt: new Date().toISOString()
})

export const testFindAllLinkedBehaviour = (it) => {
  describe('findAllLinked', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    it('returns empty array when no organisations exist', async () => {
      const result = await repository.findAllLinked()

      expect(result).toEqual([])
    })

    it('returns empty array when no organisations are linked', async () => {
      const org = buildOrganisation()
      await repository.insert(org)

      const result = await repository.findAllLinked()

      expect(result).toEqual([])
    })

    it('returns only linked organisations', async () => {
      const defraOrgId = crypto.randomUUID()
      const linkedOrg = buildOrganisation({
        linkedDefraOrganisation: buildLinkedDefraOrg(defraOrgId, 'Linked Org')
      })
      const unlinkedOrg = buildOrganisation()

      await Promise.all(
        [linkedOrg, unlinkedOrg].map((org) => repository.insert(org))
      )

      const result = await repository.findAllLinked()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(linkedOrg.id)
      expect(result[0].linkedDefraOrganisation.orgId).toBe(defraOrgId)
    })

    it('returns all linked organisations when multiple exist', async () => {
      const defraOrgId1 = crypto.randomUUID()
      const defraOrgId2 = crypto.randomUUID()

      const linkedOrg1 = buildOrganisation({
        linkedDefraOrganisation: buildLinkedDefraOrg(defraOrgId1, 'Org One')
      })
      const linkedOrg2 = buildOrganisation({
        linkedDefraOrganisation: buildLinkedDefraOrg(defraOrgId2, 'Org Two')
      })
      const unlinkedOrg = buildOrganisation()

      await Promise.all(
        [linkedOrg1, linkedOrg2, unlinkedOrg].map((org) =>
          repository.insert(org)
        )
      )

      const result = await repository.findAllLinked()

      expect(result).toHaveLength(2)
      expect(result.map((o) => o.id)).toEqual(
        expect.arrayContaining([linkedOrg1.id, linkedOrg2.id])
      )
    })

    it('returns organisations with computed status field', async () => {
      const linkedOrg = buildOrganisation({
        linkedDefraOrganisation: buildLinkedDefraOrg(
          crypto.randomUUID(),
          'Test Org'
        )
      })
      await repository.insert(linkedOrg)

      const result = await repository.findAllLinked()

      expect(result[0].status).toBe('created')
    })
  })
}
