import { testAccreditationLinkValidation } from './contract/accreditation-link.contract.js'
import { testFindBehaviour } from './contract/find.contract.js'
import { testFindByIdsBehaviour } from './contract/find-by-ids.contract.js'
import { testFindAllIdsBehaviour } from './contract/find-all-ids.contract.js'
import { testFindAllLinkedBehaviour } from './contract/find-all-linked.contract.js'
import { testFindByLinkedDefraOrgIdBehaviour } from './contract/find-by-linked-defra-org-id.contract.js'
import { testIsAccreditationNumberInUseBehaviour } from './contract/is-accreditation-number-in-use.contract.js'
import { testIsRegistrationNumberInUseBehaviour } from './contract/is-registration-number-in-use.contract.js'
import { testFindWithCriteriaBehaviour } from './contract/find-criteria.contract.js'
import { testInsertBehaviour } from './contract/insert.contract.js'
import { testReplaceBehaviour } from './contract/replace.contract.js'
import { testLinkDefraOrganisationBehaviour } from './contract/link-defra-organisation.contract.js'
import { testReplaceUsersBehaviour } from './contract/replace-users.contract.js'
import { testDataIsolationBehaviour } from './contract/data-isolation.contract.js'
import { testFindRegistrationByIdBehaviour } from './contract/find-registration-by-id.contract.js'
import { testFindAccreditationByIdBehaviour } from './contract/find-accreditation-by-id.contract.js'
import { testRegAccApprovalValidation } from './contract/reg-acc-approval.contract.js'
import { testOrgStatusTransitionBehaviour } from './contract/org-status.contract.js'
import { testRegAccStatusTransitionBehaviour } from './contract/reg-acc-status-transition.contract.js'
import { testAccreditationNumberUniquenessBehaviour } from './contract/accreditation-number-uniqueness.contract.js'
import { testRegistrationNumberUniquenessBehaviour } from './contract/registration-number-uniqueness.contract.js'
import { createOrganisationBuilders } from './contract/test-data.js'

/** @import { TestAPI } from 'vitest' */
/** @import { OrganisationBuilders } from './contract/test-data.js' */
/** @import { OrganisationsRepositoryFactory } from './port.js' */

/**
 * @param {TestAPI<{ organisationsRepository: OrganisationsRepositoryFactory }>} repositoryFactory
 */
export const testOrganisationsRepositoryContract = (repositoryFactory) => {
  const it = repositoryFactory.extend({
    organisationBuilders: async (
      // eslint-disable-next-line no-empty-pattern
      /** @type {object} */ {},
      /** @type {(builders: OrganisationBuilders) => Promise<void>} */ use
    ) => {
      await use(createOrganisationBuilders())
    }
  })

  testInsertBehaviour(it)
  testReplaceBehaviour(it)
  testLinkDefraOrganisationBehaviour(it)
  testReplaceUsersBehaviour(it)
  testFindBehaviour(it)
  testFindByIdsBehaviour(it)
  testFindAllIdsBehaviour(it)
  testFindAllLinkedBehaviour(it)
  testFindByLinkedDefraOrgIdBehaviour(it)
  testIsAccreditationNumberInUseBehaviour(it)
  testIsRegistrationNumberInUseBehaviour(it)
  testFindWithCriteriaBehaviour(it)
  testFindRegistrationByIdBehaviour(it)
  testFindAccreditationByIdBehaviour(it)
  testDataIsolationBehaviour(it)
  testRegAccApprovalValidation(it)
  testAccreditationLinkValidation(it)
  testOrgStatusTransitionBehaviour(it)
  testRegAccStatusTransitionBehaviour(it)
  testAccreditationNumberUniquenessBehaviour(it)
  testRegistrationNumberUniquenessBehaviour(it)
}
