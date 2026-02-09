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

    it('returns only linked orgs matching name filter', async () => {
      const acmeOrg = buildOrganisation({
        companyDetails: { name: 'Acme Ltd', registrationNumber: 'REG001' },
        linkedDefraOrganisation: buildLinkedDefraOrg(
          crypto.randomUUID(),
          'Defra One'
        )
      })
      const betaOrg = buildOrganisation({
        companyDetails: { name: 'Beta Corp', registrationNumber: 'REG002' },
        linkedDefraOrganisation: buildLinkedDefraOrg(
          crypto.randomUUID(),
          'Defra Two'
        )
      })

      await Promise.all([acmeOrg, betaOrg].map((org) => repository.insert(org)))

      const result = await repository.findAllLinked({ name: 'acme' })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(acmeOrg.id)
    })

    it('name filter is case-insensitive', async () => {
      const org = buildOrganisation({
        companyDetails: { name: 'Acme Ltd', registrationNumber: 'REG001' },
        linkedDefraOrganisation: buildLinkedDefraOrg(
          crypto.randomUUID(),
          'Defra Org'
        )
      })
      await repository.insert(org)

      const result = await repository.findAllLinked({ name: 'ACME' })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(org.id)
    })

    it('name filter matches partial names', async () => {
      const org = buildOrganisation({
        companyDetails: { name: 'Acme Ltd', registrationNumber: 'REG001' },
        linkedDefraOrganisation: buildLinkedDefraOrg(
          crypto.randomUUID(),
          'Defra Org'
        )
      })
      await repository.insert(org)

      const result = await repository.findAllLinked({ name: 'Acm' })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(org.id)
    })

    it('returns empty when name filter matches nothing', async () => {
      const org = buildOrganisation({
        linkedDefraOrganisation: buildLinkedDefraOrg(
          crypto.randomUUID(),
          'Defra Org'
        )
      })
      await repository.insert(org)

      const result = await repository.findAllLinked({ name: 'zzz' })

      expect(result).toEqual([])
    })

    it('returns all linked orgs when no filter provided', async () => {
      const org1 = buildOrganisation({
        companyDetails: { name: 'Acme Ltd', registrationNumber: 'REG001' },
        linkedDefraOrganisation: buildLinkedDefraOrg(
          crypto.randomUUID(),
          'Defra One'
        )
      })
      const org2 = buildOrganisation({
        companyDetails: { name: 'Beta Corp', registrationNumber: 'REG002' },
        linkedDefraOrganisation: buildLinkedDefraOrg(
          crypto.randomUUID(),
          'Defra Two'
        )
      })

      await Promise.all([org1, org2].map((org) => repository.insert(org)))

      const result = await repository.findAllLinked()

      expect(result).toHaveLength(2)
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
