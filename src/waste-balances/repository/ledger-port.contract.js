import { testAppendEventsBehaviour } from './ledger-contract/appendEvents.contract.js'
import { testFindLatestByPartitionBehaviour } from './ledger-contract/findLatestInLedger.contract.js'
import { testFindLatestByPartitionAndKindBehaviour } from './ledger-contract/findLatestInLedgerByKind.contract.js'
import { testFindEventsByPrnIdAfterBehaviour } from './ledger-contract/findEventsByPrnIdAfter.contract.js'
import { testFindAllByPartitionBehaviour } from './ledger-contract/findAllInLedger.contract.js'
import { testDeleteByPartitionBehaviour } from './ledger-contract/deleteAllInLedger.contract.js'

export const testLedgerRepositoryContract = (it) => {
  testAppendEventsBehaviour(it)
  testFindLatestByPartitionBehaviour(it)
  testFindLatestByPartitionAndKindBehaviour(it)
  testFindEventsByPrnIdAfterBehaviour(it)
  testFindAllByPartitionBehaviour(it)
  testDeleteByPartitionBehaviour(it)
}
