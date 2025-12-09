import { testFindBehaviour } from './contract/find.contract.js'
import { testFindAllFormSubmissionIdsBehaviour } from './contract/find-all-ids.contract.js'

export const testFormSubmissionsRepositoryContract = (repositoryFactory) => {
  testFindBehaviour(repositoryFactory)
  testFindAllFormSubmissionIdsBehaviour(repositoryFactory)
}
