import { createInMemorySummaryLogsRepository } from './summary-logs-repository.inmemory.js'
import { summaryLogsRepositoryContract } from './summary-logs-repository.contract.js'

summaryLogsRepositoryContract(() => createInMemorySummaryLogsRepository())

describe('createInMemorySummaryLogsRepository - implementation specific', () => {
  let repository

  beforeEach(() => {
    repository = createInMemorySummaryLogsRepository()
  })

  describe('_id field', () => {
    it('stores the summary log with _id matching insertedId', async () => {
      const fileId = `inmem-test-${Date.now()}-${Math.random()}`
      const summaryLog = {
        fileId,
        data: 'test-data'
      }

      const result = await repository.insert(summaryLog)
      const found = await repository.findByFileId(fileId)

      expect(found).toEqual({
        ...summaryLog,
        _id: result.insertedId
      })
    })
  })
})
