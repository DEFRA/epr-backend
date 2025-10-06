import { createInMemorySummaryLogsRepository } from './summary-logs-repository.inmemory.js'
import { summaryLogsRepositoryContract } from './summary-logs-repository.contract.js'

describe('In-memory summary logs repository', () => {
  summaryLogsRepositoryContract(createInMemorySummaryLogsRepository)
})
