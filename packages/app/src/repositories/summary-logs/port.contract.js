import { testFindBehaviour } from './contract/find.contract.js'
import { testInsertBehaviour } from './contract/insert.contract.js'
import { testUpdateBehaviour } from './contract/update.contract.js'
import { testOptimisticConcurrency } from './contract/optimistic-concurrency.contract.js'

export const testSummaryLogsRepositoryContract = (repositoryFactory) => {
  describe('summary logs repository contract', () => {
    testFindBehaviour(repositoryFactory)
    testInsertBehaviour(repositoryFactory)
    testUpdateBehaviour(repositoryFactory)
    testOptimisticConcurrency(repositoryFactory)
  })
}
