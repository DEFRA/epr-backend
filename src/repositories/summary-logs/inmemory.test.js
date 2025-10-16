import { randomUUID } from 'node:crypto'
import { createInMemorySummaryLogsRepository } from './inmemory.js'
import { testSummaryLogsRepositoryContract } from './port.contract.js'
import { buildSummaryLog, buildFile } from './contract/test-data.js'

describe('In-memory summary logs repository', () => {
  testSummaryLogsRepositoryContract(createInMemorySummaryLogsRepository())

  describe('data isolation', () => {
    it('returns independent copies that cannot modify stored data', async () => {
      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = createInMemorySummaryLogsRepository()
      const repository = repositoryFactory(mockLogger)
      const id = `isolation-test-${randomUUID()}`
      const summaryLog = buildSummaryLog(id, {
        file: buildFile({ name: 'original.xlsx' })
      })

      await repository.insert(summaryLog)

      const retrieved = await repository.findById(id)
      retrieved.file.name = 'modified.xlsx'
      retrieved.file.s3.bucket = 'hacked-bucket'

      const retrievedAgain = await repository.findById(id)
      expect(retrievedAgain.file.name).toBe('original.xlsx')
      expect(retrievedAgain.file.s3.bucket).toBe('test-bucket')
    })

    it('stores independent copies that cannot be modified by input mutation', async () => {
      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = createInMemorySummaryLogsRepository()
      const repository = repositoryFactory(mockLogger)
      const id = `isolation-test-${randomUUID()}`
      const summaryLog = buildSummaryLog(id, {
        file: buildFile({ name: 'original.xlsx' })
      })

      await repository.insert(summaryLog)

      summaryLog.file.name = 'mutated.xlsx'
      summaryLog.file.s3.key = 'mutated-key'

      const retrieved = await repository.findById(id)
      expect(retrieved.file.name).toBe('original.xlsx')
      expect(retrieved.file.s3.key).toBe('test-key')
    })

    it('stores independent copies on update', async () => {
      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = createInMemorySummaryLogsRepository()
      const repository = repositoryFactory(mockLogger)
      const id = `isolation-test-${randomUUID()}`
      const summaryLog = buildSummaryLog(id)

      await repository.insert(summaryLog)

      const updates = {
        status: 'validating',
        file: buildFile({ name: 'updated.xlsx' })
      }
      await repository.update(id, 1, updates)

      updates.file.name = 'mutated.xlsx'
      updates.file.s3.bucket = 'evil-bucket'

      const retrieved = await repository.findById(id)
      expect(retrieved.file.name).toBe('updated.xlsx')
      expect(retrieved.file.s3.bucket).toBe('test-bucket')
    })
  })
})
