import { testAccreditationLinkValidation } from '#repositories/organisations/contract/accreditation-link.contract.js'
import { testAccreditationNumberUniquenessBehaviour } from '#repositories/organisations/contract/accreditation-number-uniqueness.contract.js'
import { testFindByIdBehaviour } from '#repositories/organisations/contract/find-by-id.contract.js'
import { testFindAccreditationByIdBehaviour } from '#repositories/organisations/contract/find-accreditation-by-id.contract.js'
import { testFindByOrganisationNumberBehaviour } from '#repositories/organisations/contract/find-by-organisation-number.contract.js'
import { testFindRegistrationByIdBehaviour } from '#repositories/organisations/contract/find-registration-by-id.contract.js'
import { testIsAccreditationNumberInUseBehaviour } from '#repositories/organisations/contract/is-accreditation-number-in-use.contract.js'
import { testIsRegistrationNumberInUseBehaviour } from '#repositories/organisations/contract/is-registration-number-in-use.contract.js'
import { testOrgStatusTransitionBehaviour } from '#repositories/organisations/contract/org-status.contract.js'
import { testRegAccApprovalValidation } from '#repositories/organisations/contract/reg-acc-approval.contract.js'
import { testRegAccStatusTransitionBehaviour } from '#repositories/organisations/contract/reg-acc-status-transition.contract.js'
import { testRegistrationNumberUniquenessBehaviour } from '#repositories/organisations/contract/registration-number-uniqueness.contract.js'
import { testReplaceBehaviour } from '#repositories/organisations/contract/replace.contract.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'

/** @import { TestAPI } from 'vitest' */
/** @import { OrganisationBuilders } from '#repositories/organisations/contract/test-data.js' */
/** @import { OrganisationsRepositoryFactory } from '#repositories/organisations/port.js' */

/**
 * Runs the organisations repository's contracts for the functions this
 * module copies. `organisationsRepository` serves the organisations
 * repository with this module's functions in place of its own, so a contract
 * seeds through the organisations repository and checks this module's reads
 * and writes.
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

  testReplaceBehaviour(it)
  testFindByIdBehaviour(it)
  testFindByOrganisationNumberBehaviour(it)
  testIsAccreditationNumberInUseBehaviour(it)
  testIsRegistrationNumberInUseBehaviour(it)
  testFindRegistrationByIdBehaviour(it)
  testFindAccreditationByIdBehaviour(it)
  testRegAccApprovalValidation(it)
  testAccreditationLinkValidation(it)
  testOrgStatusTransitionBehaviour(it)
  testRegAccStatusTransitionBehaviour(it)
  testAccreditationNumberUniquenessBehaviour(it)
  testRegistrationNumberUniquenessBehaviour(it)
}
