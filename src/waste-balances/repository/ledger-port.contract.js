import { testInsertTransactionsBehaviour } from './ledger-contract/insertTransactions.contract.js'
import { testFindLatestByAccreditationIdBehaviour } from './ledger-contract/findLatestByAccreditationId.contract.js'
import { testFindTransactionsBySummaryLogIdBehaviour } from './ledger-contract/findTransactionsBySummaryLogId.contract.js'
import { testFindTransactionsByWasteRecordIdBehaviour } from './ledger-contract/findTransactionsByWasteRecordId.contract.js'
import { testFindTransactionsByPrnIdBehaviour } from './ledger-contract/findTransactionsByPrnId.contract.js'
import { testFindTransactionsByRowBehaviour } from './ledger-contract/findTransactionsByRow.contract.js'
import { testFindCreditedAmountsByWasteRecordIdsBehaviour } from './ledger-contract/findCreditedAmountsByWasteRecordIds.contract.js'
import { testFindLatestPerAccreditationByOrganisationIdBehaviour } from './ledger-contract/findLatestPerAccreditationByOrganisationId.contract.js'
import { testFindLatestPerAccreditationByRegistrationIdBehaviour } from './ledger-contract/findLatestPerAccreditationByRegistrationId.contract.js'

export const testLedgerRepositoryContract = (it) => {
  testInsertTransactionsBehaviour(it)
  testFindLatestByAccreditationIdBehaviour(it)
  testFindTransactionsBySummaryLogIdBehaviour(it)
  testFindTransactionsByWasteRecordIdBehaviour(it)
  testFindTransactionsByPrnIdBehaviour(it)
  testFindTransactionsByRowBehaviour(it)
  testFindCreditedAmountsByWasteRecordIdsBehaviour(it)
  testFindLatestPerAccreditationByOrganisationIdBehaviour(it)
  testFindLatestPerAccreditationByRegistrationIdBehaviour(it)
}
