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
export const testDeleteByOrganisationNumberBehaviour = (it) => {
  describe('deleteByOrganisationNumber', () => {
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

    it('deletes only the organisation holding the number', async () => {
      const deleted = buildOrganisation()
      const kept = buildOrganisation()
      await repository.insert(deleted)
      await repository.insert(kept)

      await expect(
        repository.deleteByOrganisationNumber(deleted.organisationNumber)
      ).resolves.toBe(1)

      await expect(
        repository.findByOrganisationNumber(deleted.organisationNumber)
      ).resolves.toBeNull()
      await expect(
        repository.findByOrganisationNumber(kept.organisationNumber)
      ).resolves.toMatchObject({ id: kept.id })
    })

    it('deletes nothing when no organisation holds the number', async () => {
      const kept = buildOrganisation()
      const unheld = buildOrganisation()
      await repository.insert(kept)

      await expect(
        repository.deleteByOrganisationNumber(unheld.organisationNumber)
      ).resolves.toBe(0)

      await expect(
        repository.findByOrganisationNumber(kept.organisationNumber)
      ).resolves.toMatchObject({ id: kept.id })
    })
  })
}
