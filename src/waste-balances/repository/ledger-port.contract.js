import { testInsertTransactionsBehaviour } from './ledger-contract/insertTransactions.contract.js'
import { testFindLatestByAccreditationIdBehaviour } from './ledger-contract/findLatestByAccreditationId.contract.js'
import { testFindLatestCreditedAmountsByWasteRecordsBehaviour } from './ledger-contract/findLatestCreditedAmountsByWasteRecords.contract.js'
import { testDeleteAllForAccreditationIdBehaviour } from './ledger-contract/deleteAllForAccreditationId.contract.js'

export const testLedgerRepositoryContract = (it) => {
  testInsertTransactionsBehaviour(it)
  testFindLatestByAccreditationIdBehaviour(it)
  testFindLatestCreditedAmountsByWasteRecordsBehaviour(it)
  testDeleteAllForAccreditationIdBehaviour(it)
}
