import { beforeEach, describe, expect } from 'vitest'

/** @import { TestAPI } from 'vitest' */
/** @import { OrganisationBuilders } from './test-data.js' */
/** @import { OrganisationsRepository, OrganisationsRepositoryFactory } from '../port.js' */

/**
 * @typedef {{
 *   organisationsRepository: OrganisationsRepositoryFactory,
 *   organisationBuilders: OrganisationBuilders
 * }} ContractFixtures
 */

/** @param {TestAPI<ContractFixtures>} it */
export const testFindHighestOrganisationNumberBehaviour = (it) => {
  describe('findHighestOrganisationNumber', () => {
    /** @type {OrganisationsRepository} */
    let repository
    /** @type {OrganisationBuilders['buildOrganisation']} */
    let buildOrganisation

    beforeEach(
      async (
        /** @type {ContractFixtures} */ {
          organisationsRepository,
          organisationBuilders
        }
      ) => {
        repository = organisationsRepository()
        buildOrganisation = organisationBuilders.buildOrganisation
      }
    )

    it('returns null when there are no organisations', async () => {
      await expect(repository.findHighestOrganisationNumber()).resolves.toBe(
        null
      )
    })

    /** @param {boolean} higherFirst */
    const expectHighestWhenInserted = async (higherFirst) => {
      const lower = buildOrganisation()
      const higher = buildOrganisation()
      expect(Number(higher.organisationNumber)).toBeGreaterThan(
        Number(lower.organisationNumber)
      )
      for (const organisation of higherFirst
        ? [higher, lower]
        : [lower, higher]) {
        await repository.insert(organisation)
      }

      await expect(repository.findHighestOrganisationNumber()).resolves.toBe(
        higher.organisationNumber
      )
    }

    it('returns the highest number when the higher was inserted first', async () => {
      await expectHighestWhenInserted(true)
    })

    it('returns the highest number when the lower was inserted first', async () => {
      await expectHighestWhenInserted(false)
    })
  })
}
