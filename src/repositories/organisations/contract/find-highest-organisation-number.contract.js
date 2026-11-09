import { beforeEach, describe, expect } from 'vitest'

/** @import { OrganisationBuilders } from './test-data.js' */

export const testFindHighestOrganisationNumberBehaviour = (it) => {
  describe('findHighestOrganisationNumber', () => {
    let repository
    /** @type {OrganisationBuilders['buildOrganisation']} */
    let buildOrganisation

    beforeEach(
      async (
        /** @type {{ organisationsRepository: import('../port.js').OrganisationsRepositoryFactory, organisationBuilders: OrganisationBuilders }} */ {
          organisationsRepository,
          organisationBuilders
        }
      ) => {
        repository = await organisationsRepository()
        buildOrganisation = organisationBuilders.buildOrganisation
      }
    )

    it('returns null when there are no organisations', async () => {
      await expect(repository.findHighestOrganisationNumber()).resolves.toBe(
        null
      )
    })

    it('returns the highest number any organisation holds', async () => {
      const lower = buildOrganisation()
      const higher = buildOrganisation()
      await repository.insert(higher)
      await repository.insert(lower)

      await expect(repository.findHighestOrganisationNumber()).resolves.toBe(
        String(higher.orgId)
      )
    })
  })
}
