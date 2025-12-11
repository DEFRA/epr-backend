import { testFindByAccreditationIdBehaviour } from './contract/findByAccreditationId.contract.js'
import { testUpdateWasteBalanceTransactionsBehaviour } from './contract/updateWasteBalanceTransactions.contract.js'

export const testWasteBalancesRepositoryContract = (repositoryFactory) => {
  testFindByAccreditationIdBehaviour(repositoryFactory)
  testUpdateWasteBalanceTransactionsBehaviour(repositoryFactory)
}
