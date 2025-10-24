import { testFindBehaviour } from './contract/find.contract.js'
import { testInsertBehaviour } from './contract/insert.contract.js'
import { testUpdateBehaviour } from './contract/update.contract.js'
import { testDataIsolationBehaviour } from './contract/data-isolation.contract.js'
import { testFindRegistrationByIdBehaviour } from './contract/find-registration-by-id.contract.js'

export const testOrganisationsRepositoryContract = (repositoryFactory) => {
  testInsertBehaviour(repositoryFactory)
  testUpdateBehaviour(repositoryFactory)
  testFindBehaviour(repositoryFactory)
  testFindRegistrationByIdBehaviour(repositoryFactory)
  testDataIsolationBehaviour(repositoryFactory)
}
