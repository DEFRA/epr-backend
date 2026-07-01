import { testAppendEventsBehaviour } from './stream-contract/appendEvents.contract.js'
import { testFindLatestByPartitionBehaviour } from './stream-contract/findLatestByPartition.contract.js'
import { testFindLatestByPartitionAndKindBehaviour } from './stream-contract/findLatestByPartitionAndKind.contract.js'
import { testFindEventsByPrnIdAfterBehaviour } from './stream-contract/findEventsByPrnIdAfter.contract.js'
import { testFindAllByPartitionBehaviour } from './stream-contract/findAllByPartition.contract.js'
import { testDeleteByPartitionBehaviour } from './stream-contract/deleteByPartition.contract.js'

export const testStreamRepositoryContract = (it) => {
  testAppendEventsBehaviour(it)
  testFindLatestByPartitionBehaviour(it)
  testFindLatestByPartitionAndKindBehaviour(it)
  testFindEventsByPrnIdAfterBehaviour(it)
  testFindAllByPartitionBehaviour(it)
  testDeleteByPartitionBehaviour(it)
}
