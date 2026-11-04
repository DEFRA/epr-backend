import { testAppendEventsBehaviour } from './ledger-contract/appendEvents.contract.js'
import { testFindLatestInLedgerBehaviour } from './ledger-contract/findLatestInLedger.contract.js'
import { testFindLatestInLedgerByKindBehaviour } from './ledger-contract/findLatestInLedgerByKind.contract.js'
import { testFindEventsByPrnIdAfterBehaviour } from './ledger-contract/findEventsByPrnIdAfter.contract.js'
import { testFindAllInLedgerBehaviour } from './ledger-contract/findAllInLedger.contract.js'
import { testFindLatestSubmittedSummaryLogPerLedgerBehaviour } from './ledger-contract/findLatestSubmittedSummaryLogPerLedger.contract.js'
import { testFindAccreditationIdsOfSummaryLogBehaviour } from './ledger-contract/findAccreditationIdsOfSummaryLog.contract.js'
import { testDeleteAllInLedgerBehaviour } from './ledger-contract/deleteAllInLedger.contract.js'
import { testNumbersBehaviour } from './ledger-contract/numbers.contract.js'

export const testLedgerRepositoryContract = (it) => {
  testAppendEventsBehaviour(it)
  testFindLatestInLedgerBehaviour(it)
  testFindLatestInLedgerByKindBehaviour(it)
  testFindEventsByPrnIdAfterBehaviour(it)
  testFindAllInLedgerBehaviour(it)
  testFindLatestSubmittedSummaryLogPerLedgerBehaviour(it)
  testFindAccreditationIdsOfSummaryLogBehaviour(it)
  testDeleteAllInLedgerBehaviour(it)
  testNumbersBehaviour(it)
}
