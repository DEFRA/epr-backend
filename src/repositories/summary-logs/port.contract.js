import { testFindBehaviour } from './contract/find.contract.js'
import { testInsertBehaviour } from './contract/insert.contract.js'
import { testUpdateBehaviour } from './contract/update.contract.js'
import { testOptimisticConcurrency } from './contract/optimistic-concurrency.contract.js'
import { testOrgRegOperations } from './contract/org-reg-operations.contract.js'
import { testCheckForSubmittingLog } from './contract/check-for-submitting-log.contract.js'

export const testSummaryLogsRepositoryContract = (repositoryFactory) => {
  describe('summary logs repository contract', () => {
    testFindBehaviour(repositoryFactory)
    testInsertBehaviour(repositoryFactory)
    testUpdateBehaviour(repositoryFactory)
    testOptimisticConcurrency(repositoryFactory)
    testOrgRegOperations(repositoryFactory)
    testCheckForSubmittingLog(repositoryFactory)
  })
}
