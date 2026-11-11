import { testAppendEventsBehaviour } from './ledger-contract/appendEvents.contract.js'
import { testFindLatestInLedgerBehaviour } from './ledger-contract/findLatestInLedger.contract.js'
import { testFindLatestInLedgersBehaviour } from './ledger-contract/findLatestInLedgers.contract.js'
import { testFindLatestInLedgerByKindBehaviour } from './ledger-contract/findLatestInLedgerByKind.contract.js'
import { testFindEventsByPrnIdAfterBehaviour } from './ledger-contract/findEventsByPrnIdAfter.contract.js'
import { testFindAllInLedgerBehaviour } from './ledger-contract/findAllInLedger.contract.js'
import { testFindLatestSubmittedSummaryLogPerLedgerBehaviour } from './ledger-contract/findLatestSubmittedSummaryLogPerLedger.contract.js'
import { testDeleteAllInLedgerBehaviour } from './ledger-contract/deleteAllInLedger.contract.js'
import { testNumbersBehaviour } from './ledger-contract/numbers.contract.js'

export const testLedgerRepositoryContract = (it) => {
  testAppendEventsBehaviour(it)
  testFindLatestInLedgerBehaviour(it)
  testFindLatestInLedgersBehaviour(it)
  testFindLatestInLedgerByKindBehaviour(it)
  testFindEventsByPrnIdAfterBehaviour(it)
  testFindAllInLedgerBehaviour(it)
  testFindLatestSubmittedSummaryLogPerLedgerBehaviour(it)
  testDeleteAllInLedgerBehaviour(it)
  testNumbersBehaviour(it)
}
