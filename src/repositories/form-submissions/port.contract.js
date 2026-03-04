import { testFindBehaviour } from './contract/find.contract.js'
import { testFindAllFormSubmissionIdsBehaviour } from './contract/find-all-ids.contract.js'
import { testFindCreatedAfterBehaviour } from './contract/find-created-after.contract.js'

export const testFormSubmissionsRepositoryContract = (repositoryFactory) => {
  testFindBehaviour(repositoryFactory)
  testFindAllFormSubmissionIdsBehaviour(repositoryFactory)
  testFindCreatedAfterBehaviour(repositoryFactory)
}
