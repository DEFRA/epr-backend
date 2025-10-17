import { randomUUID } from 'node:crypto'
import { createSummaryLogsRepository } from './mongodb.js'
import { testSummaryLogsRepositoryContract } from './port.contract.js'

describe('MongoDB summary logs repository', () => {
  let server
  let summaryLogsRepositoryFactory

  beforeAll(async () => {
    const { createServer } = await import('#server/server.js')
    server = await createServer()
    await server.initialize()

    summaryLogsRepositoryFactory = createSummaryLogsRepository(server.db)
  })

  afterAll(async () => {
    await server.stop()
  })

  testSummaryLogsRepositoryContract((logger) =>
    summaryLogsRepositoryFactory(logger)
  )

  describe('MongoDB-specific error handling', () => {
    it('re-throws non-duplicate key errors from MongoDB', async () => {
      const mockDb = {
        collection: () => ({
          insertOne: async () => {
            const error = new Error('Connection timeout')
            error.code = 'ETIMEOUT'
            throw error
          }
        })
      }

      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = createSummaryLogsRepository(mockDb)
      const repository = repositoryFactory(mockLogger)

      await expect(
        repository.insert({
          id: `test-${randomUUID()}`,
          status: 'validating',
          file: {
            id: `file-${randomUUID()}`,
            name: 'test.xlsx',
            s3: { bucket: 'bucket', key: 'key' }
          }
        })
      ).rejects.toThrow('Connection timeout')
    })
  })
})
