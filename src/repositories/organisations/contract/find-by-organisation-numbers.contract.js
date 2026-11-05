import { beforeEach, describe, expect } from 'vitest'

import { toOrganisationNumber } from '#domain/organisations/numbers.js'

/** @import { OrganisationBuilders } from './test-data.js' */

export const testFindByOrganisationNumbersBehaviour = (it) => {
  describe('findByOrganisationNumbers', () => {
    let repository
    /** @type {OrganisationBuilders['buildOrganisation']} */
    let buildOrganisation

    beforeEach(
      async (
        /** @type {{ organisationsRepository: import("../port.js").OrganisationsRepositoryFactory, organisationBuilders: OrganisationBuilders }} */ {
          organisationsRepository,
          organisationBuilders
        }
      ) => {
        repository = await organisationsRepository()
        buildOrganisation = organisationBuilders.buildOrganisation
      }
    )

    it('returns empty array when given empty array', async () => {
      const result = await repository.findByOrganisationNumbers([])

      expect(result).toEqual([])
    })

    it('returns organisations holding the given numbers', async () => {
      const org1 = buildOrganisation()
      const org2 = buildOrganisation()
      const org3 = buildOrganisation()

      await Promise.all([org1, org2, org3].map((org) => repository.insert(org)))

      const result = await repository.findByOrganisationNumbers([
        toOrganisationNumber(String(org1.orgId)),
        toOrganisationNumber(String(org2.orgId))
      ])

      expect(result.map((o) => o.id)).toEqual(
        expect.arrayContaining([org1.id, org2.id])
      )
      expect(result).toHaveLength(2)
    })
  })
}
