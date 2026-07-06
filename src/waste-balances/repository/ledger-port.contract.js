import { testAppendEventsBehaviour } from './ledger-contract/appendEvents.contract.js'
import { testFindLatestInLedgerBehaviour } from './ledger-contract/findLatestInLedger.contract.js'
import { testFindLatestInLedgerByKindBehaviour } from './ledger-contract/findLatestInLedgerByKind.contract.js'
import { testFindEventsByPrnIdAfterBehaviour } from './ledger-contract/findEventsByPrnIdAfter.contract.js'
import { testFindAllInLedgerBehaviour } from './ledger-contract/findAllInLedger.contract.js'
import { testDeleteAllInLedgerBehaviour } from './ledger-contract/deleteAllInLedger.contract.js'

export const testLedgerRepositoryContract = (it) => {
  testAppendEventsBehaviour(it)
  testFindLatestInLedgerBehaviour(it)
  testFindLatestInLedgerByKindBehaviour(it)
  testFindEventsByPrnIdAfterBehaviour(it)
  testFindAllInLedgerBehaviour(it)
  testDeleteAllInLedgerBehaviour(it)
}
