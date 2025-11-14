import { testFindByRegistrationBehaviour } from './contract/findByRegistration.contract.js'
import { testUpsertWasteRecordsBehaviour } from './contract/upsertWasteRecords.contract.js'
import { testDataIsolationBehaviour } from './contract/data-isolation.contract.js'
import { testAppendVersionsBehaviour } from './contract/appendVersions.contract.js'

export const testWasteRecordsRepositoryContract = (repositoryFactory) => {
  testFindByRegistrationBehaviour(repositoryFactory)
  testUpsertWasteRecordsBehaviour(repositoryFactory)
  testDataIsolationBehaviour(repositoryFactory)
  testAppendVersionsBehaviour(repositoryFactory)
}
