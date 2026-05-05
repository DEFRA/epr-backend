import { testFindByAccreditationIdBehaviour } from './contract/findByAccreditationId.contract.js'
import { testFindByAccreditationIdsBehaviour } from './contract/findByAccreditationIds.contract.js'
import { testUpdateWasteBalanceTransactionsBehaviour } from './contract/updateWasteBalanceTransactions.contract.js'
import { testDeductAvailableBalanceForPrnCreationBehaviour } from './contract/deductAvailableBalanceForPrnCreation.contract.js'
import { testDeductTotalBalanceForPrnIssueBehaviour } from './contract/deductTotalBalanceForPrnIssue.contract.js'
import { testCreditAvailableBalanceForPrnCancellationBehaviour } from './contract/creditAvailableBalanceForPrnCancellation.contract.js'
import { testCreditFullBalanceForIssuedPrnCancellationBehaviour } from './contract/creditFullBalanceForIssuedPrnCancellation.contract.js'
import { testFlipCanonicalSourceToV2Behaviour } from './contract/flipCanonicalSourceToV2.contract.js'

export const testWasteBalancesRepositoryContract = (repositoryFactory) => {
  testFindByAccreditationIdBehaviour(repositoryFactory)
  testFindByAccreditationIdsBehaviour(repositoryFactory)
  testUpdateWasteBalanceTransactionsBehaviour(repositoryFactory)
  testDeductAvailableBalanceForPrnCreationBehaviour(repositoryFactory)
  testDeductTotalBalanceForPrnIssueBehaviour(repositoryFactory)
  testCreditAvailableBalanceForPrnCancellationBehaviour(repositoryFactory)
  testCreditFullBalanceForIssuedPrnCancellationBehaviour(repositoryFactory)
  testFlipCanonicalSourceToV2Behaviour(repositoryFactory)
}
