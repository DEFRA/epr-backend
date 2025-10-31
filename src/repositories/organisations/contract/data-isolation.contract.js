import { describe, beforeEach } from 'vitest'
import { buildOrganisation } from './test-data.js'

export const testDataIsolationBehaviour = (it) => {
  describe('data isolation', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

    describe('findAll isolation', () => {
      it('returns independent copies that cannot modify stored data', async () => {
        const org1 = buildOrganisation()
        const org2 = buildOrganisation()
        await repository.insert(org1)
        await repository.insert(org2)

        const firstRead = await repository.findAll()
        const originalOrgId = firstRead[0].orgId

        // mutate returned array and objects
        firstRead[0].orgId = 999999
        firstRead.push(buildOrganisation())

        const secondRead = await repository.findAll()
        expect(secondRead).toHaveLength(2)
        expect(secondRead[0].orgId).toBe(originalOrgId)
      })
    })

    describe('findById isolation', () => {
      it('returns a clone, not internal reference', async () => {
        const org = buildOrganisation()
        await repository.insert(org)

        const result = await repository.findById(org.id)
        const originalOrgId = result.orgId
        result.orgId = 999999

        const again = await repository.findById(org.id)
        expect(again.orgId).toBe(originalOrgId)
      })
    })

    describe('insert isolation', () => {
      it('stores independent copies so input mutations do not affect storage', async () => {
        const org = buildOrganisation()
        const originalOrgId = org.orgId

        await repository.insert(org)

        // mutate input after insert
        org.orgId = 999999

        const result = await repository.findById(org.id)
        expect(result.orgId).toBe(originalOrgId)
      })
    })
  })
}
