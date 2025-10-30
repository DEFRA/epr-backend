import { SCHEMA_VERSION, ORG_ID_START_NUMBER } from '#common/enums/index.js'
import { createApplicationsRepository } from './mongodb.js'
import { testApplicationsRepositoryContract } from './port.contract.js'

describe('MongoDB applications repository', () => {
  let server
  let applicationsRepositoryFactory

  beforeAll(async () => {
    const { createServer } = await import('#server/server.js')
    server = await createServer()
    await server.initialize()

    applicationsRepositoryFactory = createApplicationsRepository(server.db)
  })

  afterAll(async () => {
    await server.stop()
  })

  testApplicationsRepositoryContract((logger) =>
    applicationsRepositoryFactory(logger)
  )

  describe('MongoDB-specific error handling', () => {
    it('re-throws non-validation errors from MongoDB', async () => {
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
      const repositoryFactory = createApplicationsRepository(mockDb)
      const repository = repositoryFactory(mockLogger)

      await expect(
        repository.insertAccreditation({
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 123,
          referenceNumber: '607f1f77bcf86cd799439099',
          answers: [],
          rawSubmissionData: {}
        })
      ).rejects.toThrow('Connection timeout')
    })
  })
})
