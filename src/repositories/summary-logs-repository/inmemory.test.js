import { createInMemorySummaryLogsRepository } from './inmemory.js'
import { testSummaryLogsRepositoryContract } from './contract.js'

describe('In-memory summary logs repository', () => {
  testSummaryLogsRepositoryContract(createInMemorySummaryLogsRepository)
})
