import { testFindBalanceBehaviour } from './contract/findBalance.contract.js'
import { testUpdateWasteBalanceTransactionsBehaviour } from './contract/updateWasteBalanceTransactions.contract.js'
import { testDeductAvailableBalanceForPrnCreationBehaviour } from './contract/deductAvailableBalanceForPrnCreation.contract.js'
import { testDeductTotalBalanceForPrnIssueBehaviour } from './contract/deductTotalBalanceForPrnIssue.contract.js'
import { testCreditAvailableBalanceForPrnCancellationBehaviour } from './contract/creditAvailableBalanceForPrnCancellation.contract.js'
import { testCreditFullBalanceForIssuedPrnCancellationBehaviour } from './contract/creditFullBalanceForIssuedPrnCancellation.contract.js'
import { testAppendStreamEventBehaviour } from './contract/appendStreamEvent.contract.js'
import { testGetPrnCatchupEventsBehaviour } from './contract/getPrnCatchupEvents.contract.js'

export const testWasteBalancesRepositoryContract = (repositoryFactory) => {
  testFindBalanceBehaviour(repositoryFactory)
  testUpdateWasteBalanceTransactionsBehaviour(repositoryFactory)
  testDeductAvailableBalanceForPrnCreationBehaviour(repositoryFactory)
  testDeductTotalBalanceForPrnIssueBehaviour(repositoryFactory)
  testCreditAvailableBalanceForPrnCancellationBehaviour(repositoryFactory)
  testCreditFullBalanceForIssuedPrnCancellationBehaviour(repositoryFactory)
  testAppendStreamEventBehaviour(repositoryFactory)
  testGetPrnCatchupEventsBehaviour(repositoryFactory)
}
