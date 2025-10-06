import { createInMemorySummaryLogsRepository } from './summary-logs-repository.inmemory.js'
import { summaryLogsRepositoryContract } from './summary-logs-repository.contract.js'

summaryLogsRepositoryContract(() => createInMemorySummaryLogsRepository())

describe('createInMemorySummaryLogsRepository - implementation specific', () => {
  let repository

  beforeEach(() => {
    repository = createInMemorySummaryLogsRepository()
  })

  describe('clear', () => {
    it('removes all summary logs', async () => {
      await repository.insert({ fileId: 'file-1' })
      await repository.insert({ fileId: 'file-2' })

      repository.clear()

      const result1 = await repository.findByFileId('file-1')
      const result2 = await repository.findByFileId('file-2')

      expect(result1).toBeNull()
      expect(result2).toBeNull()
    })
  })

  describe('_id field', () => {
    it('stores the summary log with _id matching insertedId', async () => {
      const summaryLog = {
        fileId: 'test-file-id',
        data: 'test-data'
      }

      const result = await repository.insert(summaryLog)
      const found = await repository.findByFileId('test-file-id')

      expect(found).toEqual({
        ...summaryLog,
        _id: result.insertedId
      })
    })
  })
})
