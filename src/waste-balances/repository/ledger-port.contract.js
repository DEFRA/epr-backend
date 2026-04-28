import { testInsertTransactionBehaviour } from './ledger-contract/insertTransaction.contract.js'
import { testFindLatestByAccreditationIdBehaviour } from './ledger-contract/findLatestByAccreditationId.contract.js'

export const testLedgerRepositoryContract = (it) => {
  testInsertTransactionBehaviour(it)
  testFindLatestByAccreditationIdBehaviour(it)
}
