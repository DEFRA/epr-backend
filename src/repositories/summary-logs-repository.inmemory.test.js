import { createInMemorySummaryLogsRepository } from './summary-logs-repository.inmemory.js'
import { testSummaryLogsRepositoryContract } from './summary-logs-repository.contract.js'

describe('In-memory summary logs repository', () => {
  testSummaryLogsRepositoryContract(createInMemorySummaryLogsRepository)
})
