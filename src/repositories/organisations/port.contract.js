import { testFindBehaviour } from './contract/find.contract.js'
import { testInsertBehaviour } from './contract/insert.contract.js'
import { testUpdateBehaviour } from './contract/update.contract.js'

export const testOrganisationsRepositoryContract = (repositoryFactory) => {
  testInsertBehaviour(repositoryFactory)
  testUpdateBehaviour(repositoryFactory)
  testFindBehaviour(repositoryFactory)
}
