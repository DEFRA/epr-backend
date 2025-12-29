import { testFindBehaviour } from './contract/find.contract.js'
import { testFindAllIdsBehaviour } from './contract/find-all-ids.contract.js'
import { testInsertBehaviour } from './contract/insert.contract.js'
import { testReplaceBehaviour } from './contract/replace.contract.js'
import { testDataIsolationBehaviour } from './contract/data-isolation.contract.js'
import { testFindRegistrationByIdBehaviour } from './contract/find-registration-by-id.contract.js'
import { testFindAccreditationByIdBehaviour } from './contract/find-accreditation-by-id.contract.js'
import { testRegAccApprovalValidation } from './contract/reg-acc-approval.contract.js'
import { testOrgStatusTransitionBehaviour } from './contract/org-status.contract.js'
import { testRegAccStatusTransitionBehaviour } from './contract/reg-acc-status-transition.contract.js'

export const testOrganisationsRepositoryContract = (repositoryFactory) => {
  testInsertBehaviour(repositoryFactory)
  testReplaceBehaviour(repositoryFactory)
  testFindBehaviour(repositoryFactory)
  testFindAllIdsBehaviour(repositoryFactory)
  testFindRegistrationByIdBehaviour(repositoryFactory)
  testFindAccreditationByIdBehaviour(repositoryFactory)
  testDataIsolationBehaviour(repositoryFactory)
  testRegAccApprovalValidation(repositoryFactory)
  testOrgStatusTransitionBehaviour(repositoryFactory)
  testRegAccStatusTransitionBehaviour(repositoryFactory)
}
