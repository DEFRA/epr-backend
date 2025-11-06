import { testFindAllBehaviour } from './contract/findAll.contract.js'
import { testSaveAllBehaviour } from './contract/saveAll.contract.js'
import { testDataIsolationBehaviour } from './contract/data-isolation.contract.js'

export const testWasteRecordsRepositoryContract = (repositoryFactory) => {
  testFindAllBehaviour(repositoryFactory)
  testSaveAllBehaviour(repositoryFactory)
  testDataIsolationBehaviour(repositoryFactory)
}
