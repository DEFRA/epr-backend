import { createSummaryLogsRepository } from './summary-logs-repository.js'
import { summaryLogsRepositoryContract } from './summary-logs-repository.contract.js'

describe('createSummaryLogsRepository with real MongoDB', () => {
  let server
  let repository

  beforeAll(async () => {
    const { createServer } = await import('../server.js')
    server = await createServer()
    await server.initialize()

    repository = createSummaryLogsRepository(server.db)
  })

  afterAll(async () => {
    await server.stop()
  })

  summaryLogsRepositoryContract(() => repository)
})

describe('createSummaryLogsRepository - MongoDB API calls', () => {
  let repository
  let mockCollection
  let mockDb

  beforeEach(() => {
    mockCollection = {
      insertOne: vi.fn(),
      findOne: vi.fn()
    }

    mockDb = {
      collection: vi.fn(() => mockCollection)
    }

    repository = createSummaryLogsRepository(mockDb)
  })

  describe('insert', () => {
    it('calls MongoDB insertOne with the summary log', async () => {
      const summaryLog = {
        fileId: 'test-file-id',
        organisationId: 'org-123',
        registrationId: 'reg-456'
      }
      const expectedResult = { insertedId: 'abc123' }
      mockCollection.insertOne.mockResolvedValue(expectedResult)

      const result = await repository.insert(summaryLog)

      expect(mockDb.collection).toHaveBeenCalledWith('summary-logs')
      expect(mockCollection.insertOne).toHaveBeenCalledWith(summaryLog)
      expect(result).toEqual(expectedResult)
    })
  })

  describe('findByFileId', () => {
    it('calls MongoDB findOne with fileId query', async () => {
      const fileId = 'test-file-id'
      const expectedLog = { fileId, data: 'test-data' }
      mockCollection.findOne.mockResolvedValue(expectedLog)

      const result = await repository.findByFileId(fileId)

      expect(mockDb.collection).toHaveBeenCalledWith('summary-logs')
      expect(mockCollection.findOne).toHaveBeenCalledWith({ fileId })
      expect(result).toEqual(expectedLog)
    })
  })
})
