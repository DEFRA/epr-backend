import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { testIsAccreditationNumberInUseBehaviour } from './is-accreditation-number-in-use.contract.js'
import { testIsRegistrationNumberInUseBehaviour } from './is-registration-number-in-use.contract.js'

/** @import { TestAPI } from 'vitest' */
/** @import { OrganisationBuilders } from '#repositories/organisations/contract/test-data.js' */
/** @import { OrganisationsRepositoryFactory } from '#repositories/organisations/port.js' */

/**
 * `organisationsRepository` serves the organisations repository with this
 * module's functions beside its own, so a contract seeds through the
 * organisations repository and checks this module's reads.
 *
 * @param {TestAPI<{ organisationsRepository: OrganisationsRepositoryFactory }>} repositoryFactory
 */
export const testRegistrationAccreditationAdminRepositoryContract = (
  repositoryFactory
) => {
  const it = repositoryFactory.extend({
    organisationBuilders: async (
      // eslint-disable-next-line no-empty-pattern
      /** @type {object} */ {},
      /** @type {(builders: OrganisationBuilders) => Promise<void>} */ use
    ) => {
      await use(createOrganisationBuilders())
    }
  })

  testIsAccreditationNumberInUseBehaviour(it)
  testIsRegistrationNumberInUseBehaviour(it)
}
