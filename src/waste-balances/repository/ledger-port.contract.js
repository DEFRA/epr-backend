import { testInsertTransactionsBehaviour } from './ledger-contract/insertTransactions.contract.js'
import { testFindLatestByAccreditationIdBehaviour } from './ledger-contract/findLatestByAccreditationId.contract.js'
import { testFindLatestCreditedAmountsByWasteRecordsBehaviour } from './ledger-contract/findLatestCreditedAmountsByWasteRecords.contract.js'

export const testLedgerRepositoryContract = (it) => {
  testInsertTransactionsBehaviour(it)
  testFindLatestByAccreditationIdBehaviour(it)
  testFindLatestCreditedAmountsByWasteRecordsBehaviour(it)
}
