import { createInMemorySummaryLogsRepository } from './summary-logs-repository.inmemory.js'
import { summaryLogsRepositoryContract } from './summary-logs-repository.contract.js'

summaryLogsRepositoryContract(() => createInMemorySummaryLogsRepository())
