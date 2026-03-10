import { testCreateBehaviour } from './contract/create.contract.js'
import { testDataIsolation } from './contract/data-isolation.contract.js'
import { testFindBehaviour } from './contract/find.contract.js'
import { testUpdateBehaviour } from './contract/update.contract.js'
import { testRemoveBehaviour } from './contract/remove.contract.js'
import { testValidationBehaviour } from './contract/validation.contract.js'

export const testOverseasSitesRepositoryContract = (repositoryFactory) => {
  describe('overseas sites repository contract', () => {
    testCreateBehaviour(repositoryFactory)
    testDataIsolation(repositoryFactory)
    testFindBehaviour(repositoryFactory)
    testUpdateBehaviour(repositoryFactory)
    testRemoveBehaviour(repositoryFactory)
    testValidationBehaviour(repositoryFactory)
  })
}
