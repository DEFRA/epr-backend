import { createInMemorySummaryLogsRepository } from './inmemory.js'
import { testSummaryLogsRepositoryContract } from './summary-logs-repository.contract.js'

describe('In-memory summary logs repository', () => {
  testSummaryLogsRepositoryContract(createInMemorySummaryLogsRepository)

  // Minimal sanity test to appease SonarQube and verify factory shape
  it('returns a repo with expected methods', () => {
    const repo = createInMemorySummaryLogsRepository()
    expect(typeof repo.insert).toBe('function')
    expect(typeof repo.findById).toBe('function')
  })
})
