import { testFindByAccreditationIdBehaviour } from './contract/findByAccreditationId.contract.js'
import { testFindByAccreditationIdsBehaviour } from './contract/findByAccreditationIds.contract.js'
import { testUpdateWasteBalanceTransactionsBehaviour } from './contract/updateWasteBalanceTransactions.contract.js'
import { testDeductAvailableBalanceForPrnCreationBehaviour } from './contract/deductAvailableBalanceForPrnCreation.contract.js'

export const testWasteBalancesRepositoryContract = (repositoryFactory) => {
  testFindByAccreditationIdBehaviour(repositoryFactory)
  testFindByAccreditationIdsBehaviour(repositoryFactory)
  testUpdateWasteBalanceTransactionsBehaviour(repositoryFactory)
  testDeductAvailableBalanceForPrnCreationBehaviour(repositoryFactory)
}
