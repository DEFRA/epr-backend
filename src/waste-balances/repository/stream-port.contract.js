import { testAppendEventBehaviour } from './stream-contract/appendEvent.contract.js'
import { testFindLatestByPartitionBehaviour } from './stream-contract/findLatestByPartition.contract.js'
import { testFindLatestByPartitionAndKindBehaviour } from './stream-contract/findLatestByPartitionAndKind.contract.js'
import { testFindEventsByPrnIdAfterBehaviour } from './stream-contract/findEventsByPrnIdAfter.contract.js'
import { testDeleteAllForPartitionBehaviour } from './stream-contract/deleteAllForPartition.contract.js'

export const testStreamRepositoryContract = (it) => {
  testAppendEventBehaviour(it)
  testFindLatestByPartitionBehaviour(it)
  testFindLatestByPartitionAndKindBehaviour(it)
  testFindEventsByPrnIdAfterBehaviour(it)
  testDeleteAllForPartitionBehaviour(it)
}
