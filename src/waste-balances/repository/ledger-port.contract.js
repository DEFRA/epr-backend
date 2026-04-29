import { testInsertTransactionsBehaviour } from './ledger-contract/insertTransactions.contract.js'
import { testFindLatestByAccreditationIdBehaviour } from './ledger-contract/findLatestByAccreditationId.contract.js'
import { testFindCreditedAmountsByWasteRecordIdsBehaviour } from './ledger-contract/findCreditedAmountsByWasteRecordIds.contract.js'

export const testLedgerRepositoryContract = (it) => {
  testInsertTransactionsBehaviour(it)
  testFindLatestByAccreditationIdBehaviour(it)
  testFindCreditedAmountsByWasteRecordIdsBehaviour(it)
}
