import { testCreateBehaviour } from './contract/create.contract.js'
import { testDataIsolation } from './contract/data-isolation.contract.js'
import { testFindBehaviour } from './contract/find.contract.js'
import { testUpdateStatusBehaviour } from './contract/update-status.contract.js'
import { testPrnNumberUniqueness } from './contract/prn-number-uniqueness.contract.js'

export const testPackagingRecyclingNotesRepositoryContract = (
  repositoryFactory
) => {
  describe('packaging recycling notes repository contract', () => {
    testCreateBehaviour(repositoryFactory)
    testDataIsolation(repositoryFactory)
    testFindBehaviour(repositoryFactory)
    testUpdateStatusBehaviour(repositoryFactory)
    testPrnNumberUniqueness(repositoryFactory)
  })
}
