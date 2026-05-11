import { testFindByRegistrationBehaviour } from './contract/findByRegistration.contract.js'
import { testDataIsolationBehaviour } from './contract/data-isolation.contract.js'
import { testAppendVersionsBehaviour } from './contract/appendVersions.contract.js'
import { testFindDistinctDataKeysBehaviour } from './contract/findDistinctDataKeys.contract.js'

export const testWasteRecordsRepositoryContract = (repositoryFactory) => {
  testFindByRegistrationBehaviour(repositoryFactory)
  testDataIsolationBehaviour(repositoryFactory)
  testAppendVersionsBehaviour(repositoryFactory)
  testFindDistinctDataKeysBehaviour(repositoryFactory)
}
