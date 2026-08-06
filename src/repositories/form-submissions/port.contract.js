import { testFindBehaviour } from './contract/find.contract.js'
import { testFindAllFormSubmissionIdsBehaviour } from './contract/find-all-ids.contract.js'
import {
  testAllocateOrgIdBehaviour,
  testInsertBehaviour
} from './contract/insert.contract.js'

export const testFormSubmissionsRepositoryContract = (repositoryFactory) => {
  testFindBehaviour(repositoryFactory)
  testFindAllFormSubmissionIdsBehaviour(repositoryFactory)
  testAllocateOrgIdBehaviour(repositoryFactory)
  testInsertBehaviour(repositoryFactory)
}
