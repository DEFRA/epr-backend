import { randomUUID } from 'node:crypto'
import { createInMemorySummaryLogsRepository } from './inmemory.js'
import { testSummaryLogsRepositoryContract } from './summary-logs-repository.contract.js'
import { buildSummaryLog, buildFile } from './contract/test-data.js'

describe('In-memory summary logs repository', () => {
  testSummaryLogsRepositoryContract(createInMemorySummaryLogsRepository)

  describe('data isolation', () => {
    it('returns independent copies that cannot modify stored data', async () => {
      const repo = createInMemorySummaryLogsRepository()
      const id = `isolation-test-${randomUUID()}`
      const summaryLog = buildSummaryLog(id, {
        file: buildFile({ name: 'original.xlsx' })
      })

      await repo.insert(summaryLog)

      const retrieved = await repo.findById(id)
      retrieved.file.name = 'modified.xlsx'
      retrieved.file.s3.bucket = 'hacked-bucket'

      const retrievedAgain = await repo.findById(id)
      expect(retrievedAgain.file.name).toBe('original.xlsx')
      expect(retrievedAgain.file.s3.bucket).toBe('test-bucket')
    })

    it('stores independent copies that cannot be modified by input mutation', async () => {
      const repo = createInMemorySummaryLogsRepository()
      const id = `isolation-test-${randomUUID()}`
      const summaryLog = buildSummaryLog(id, {
        file: buildFile({ name: 'original.xlsx' })
      })

      await repo.insert(summaryLog)

      summaryLog.file.name = 'mutated.xlsx'
      summaryLog.file.s3.key = 'mutated-key'

      const retrieved = await repo.findById(id)
      expect(retrieved.file.name).toBe('original.xlsx')
      expect(retrieved.file.s3.key).toBe('test-key')
    })

    it('stores independent copies on update', async () => {
      const repo = createInMemorySummaryLogsRepository()
      const id = `isolation-test-${randomUUID()}`
      const summaryLog = buildSummaryLog(id)

      await repo.insert(summaryLog)

      const updates = {
        status: 'complete',
        file: buildFile({ name: 'updated.xlsx' })
      }
      await repo.update(id, 1, updates)

      updates.file.name = 'mutated.xlsx'
      updates.file.s3.bucket = 'evil-bucket'

      const retrieved = await repo.findById(id)
      expect(retrieved.file.name).toBe('updated.xlsx')
      expect(retrieved.file.s3.bucket).toBe('test-bucket')
    })
  })
})
