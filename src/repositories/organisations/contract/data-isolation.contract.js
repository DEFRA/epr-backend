import { buildOrganisation } from './test-data.js'

export const testDataIsolationBehaviour = (repositoryFactory) => {
  describe('data isolation', () => {
    let repository

    beforeEach(async () => {
      repository = await repositoryFactory()
    })

    describe('findAll isolation', () => {
      it('returns independent copies that cannot modify stored data', async () => {
        const org1 = buildOrganisation()
        const org2 = buildOrganisation()
        await repository.insert(org1)
        await repository.insert(org2)

        const firstRead = await repository.findAll()
        const org1FromFirstRead = firstRead.find((o) => o.orgId === org1.orgId)
        const originalOrgId = org1FromFirstRead.orgId

        // mutate returned array and objects
        org1FromFirstRead.orgId = 999999
        firstRead.push(buildOrganisation())

        const secondRead = await repository.findAll()
        const org1FromSecondRead = secondRead.find(
          (o) => o.orgId === originalOrgId
        )
        expect(org1FromSecondRead.orgId).toBe(originalOrgId)
        expect(secondRead.some((o) => o.orgId === org2.orgId)).toBe(true)
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
