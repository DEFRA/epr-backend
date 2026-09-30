import { beforeEach, describe, expect } from 'vitest'
import { buildOrganisation } from './test-data.js'

export const testFindByRegistrationIdsBehaviour = (it) => {
  describe('findByRegistrationIds', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ organisationsRepository: import("../port.js").OrganisationsRepositoryFactory }} */ {
          organisationsRepository
        }
      ) => {
        repository = await organisationsRepository()
      }
    )

    it('returns empty array when given empty array', async () => {
      const result = await repository.findByRegistrationIds([])

      expect(result).toEqual([])
    })

    it('returns the organisations holding any of the registrations', async () => {
      const org1 = buildOrganisation()
      const org2 = buildOrganisation()
      const org3 = buildOrganisation()

      await Promise.all([org1, org2, org3].map((org) => repository.insert(org)))

      const result = await repository.findByRegistrationIds([
        org1.registrations[0].id,
        org2.registrations[1].id,
        'not-held-by-anyone'
      ])

      expect(result.map((o) => o.id)).toEqual(
        expect.arrayContaining([org1.id, org2.id])
      )
      expect(result).toHaveLength(2)
    })

    it('returns an organisation once however many of its registrations match', async () => {
      const org = buildOrganisation()
      await repository.insert(org)

      const result = await repository.findByRegistrationIds(
        org.registrations.map((registration) => registration.id)
      )

      expect(result.map((o) => o.id)).toEqual([org.id])
    })
  })
}
