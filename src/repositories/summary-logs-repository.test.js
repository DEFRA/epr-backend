import { createSummaryLogsRepository } from './summary-logs-repository.js'

describe('createSummaryLogsRepository', () => {
  let repository
  let mockCollection

  beforeEach(() => {
    mockCollection = {
      insertOne: vi.fn(),
      findOne: vi.fn(),
      find: vi.fn(() => ({
        toArray: vi.fn()
      }))
    }

    const mockDb = {
      collection: vi.fn(() => mockCollection)
    }

    repository = createSummaryLogsRepository(mockDb)
  })

  describe('insert', () => {
    it('inserts a summary log', async () => {
      const summaryLog = {
        fileId: 'test-file-id',
        organisationId: 'org-123',
        registrationId: 'reg-456'
      }
      const expectedResult = { insertedId: 'abc123' }
      mockCollection.insertOne.mockResolvedValue(expectedResult)

      const result = await repository.insert(summaryLog)

      expect(mockCollection.insertOne).toHaveBeenCalledWith(summaryLog)
      expect(result).toEqual(expectedResult)
    })
  })

  describe('findByFileId', () => {
    it('finds a summary log by file ID', async () => {
      const fileId = 'test-file-id'
      const expectedLog = { fileId, data: 'test-data' }
      mockCollection.findOne.mockResolvedValue(expectedLog)

      const result = await repository.findByFileId(fileId)

      expect(mockCollection.findOne).toHaveBeenCalledWith({ fileId })
      expect(result).toEqual(expectedLog)
    })
  })

  describe('findByOrganisationAndRegistration', () => {
    it('finds summary logs by organisation and registration IDs', async () => {
      const organisationId = 'org-123'
      const registrationId = 'reg-456'
      const expectedLogs = [
        { organisationId, registrationId, fileId: 'file-1' },
        { organisationId, registrationId, fileId: 'file-2' }
      ]
      const mockToArray = vi.fn().mockResolvedValue(expectedLogs)
      mockCollection.find.mockReturnValue({ toArray: mockToArray })

      const result = await repository.findByOrganisationAndRegistration(
        organisationId,
        registrationId
      )

      expect(mockCollection.find).toHaveBeenCalledWith({
        organisationId,
        registrationId
      })
      expect(result).toEqual(expectedLogs)
    })
  })
})
