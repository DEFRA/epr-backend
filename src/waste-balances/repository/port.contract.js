import { testFindByAccreditationIdBehaviour } from './contract/findByAccreditationId.contract.js'
import { testFindByAccreditationIdsBehaviour } from './contract/findByAccreditationIds.contract.js'
import { testUpdateWasteBalanceTransactionsBehaviour } from './contract/updateWasteBalanceTransactions.contract.js'
import { testDeductAvailableBalanceForPrnCreationBehaviour } from './contract/deductAvailableBalanceForPrnCreation.contract.js'
import { testDeductTotalBalanceForPrnIssueBehaviour } from './contract/deductTotalBalanceForPrnIssue.contract.js'
import { testCreditAvailableBalanceForPrnCancellationBehaviour } from './contract/creditAvailableBalanceForPrnCancellation.contract.js'
import { testCreditFullBalanceForIssuedPrnCancellationBehaviour } from './contract/creditFullBalanceForIssuedPrnCancellation.contract.js'
import { testAppendStreamEventBehaviour } from './contract/appendStreamEvent.contract.js'
import { testFlipCanonicalSourceToMigratingBehaviour } from './contract/flipCanonicalSourceToMigrating.contract.js'
import { testFlipCanonicalSourceToLedgerBehaviour } from './contract/flipCanonicalSourceToLedger.contract.js'
import { testResetCanonicalSourceToEmbeddedBehaviour } from './contract/resetCanonicalSourceToEmbedded.contract.js'
import { testGetPrnCatchupEventsBehaviour } from './contract/getPrnCatchupEvents.contract.js'

export const testWasteBalancesRepositoryContract = (repositoryFactory) => {
  testFindByAccreditationIdBehaviour(repositoryFactory)
  testFindByAccreditationIdsBehaviour(repositoryFactory)
  testUpdateWasteBalanceTransactionsBehaviour(repositoryFactory)
  testDeductAvailableBalanceForPrnCreationBehaviour(repositoryFactory)
  testDeductTotalBalanceForPrnIssueBehaviour(repositoryFactory)
  testCreditAvailableBalanceForPrnCancellationBehaviour(repositoryFactory)
  testCreditFullBalanceForIssuedPrnCancellationBehaviour(repositoryFactory)
  testAppendStreamEventBehaviour(repositoryFactory)
  testFlipCanonicalSourceToMigratingBehaviour(repositoryFactory)
  testFlipCanonicalSourceToLedgerBehaviour(repositoryFactory)
  testResetCanonicalSourceToEmbeddedBehaviour(repositoryFactory)
  testGetPrnCatchupEventsBehaviour(repositoryFactory)
}
