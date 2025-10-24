import { summaryLogsValidator } from '#application/summary-logs/validator.js'
import { createUploadsRepository } from '#adapters/repositories/uploads/s3.js'
import { createSummaryLogsParser } from '#adapters/parsers/summary-logs/stub.js'
import { createMongoClient } from '#common/helpers/mongo-client.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createMockConfig } from '#test/helpers/mock-config.js'

import summaryLogsValidatorWorkerThread from './worker-thread.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock('#application/summary-logs/validator.js')
vi.mock('#adapters/parsers/summary-logs/stub.js')
vi.mock('#adapters/repositories/uploads/s3.js')
vi.mock('#common/helpers/mongo-client.js')
vi.mock('#common/helpers/s3/s3-client.js')
vi.mock('#common/helpers/secure-context.js')
vi.mock('#repositories/summary-logs/mongodb.js')
vi.mock('#repositories/organisations/mongodb.js')
vi.mock('../../../config.js', () => createMockConfig())

describe('summaryLogsValidatorWorkerThread', () => {
  let mockDb
  let mockMongoClient
  let mockS3Client
  let mockSummaryLogsRepository
  let mockUploadsRepository
  let mockSummaryLogsParser
  let mockOrganisationsRepository

  let summaryLogId

  beforeEach(() => {
    mockDb = { collection: vi.fn() }

    mockMongoClient = {
      db: vi.fn().mockReturnValue(mockDb),
      close: vi.fn().mockResolvedValue(undefined)
    }

    mockS3Client = {
      destroy: vi.fn()
    }

    mockSummaryLogsRepository = {
      update: vi.fn()
    }

    mockUploadsRepository = {
      findByLocation: vi.fn()
    }

    mockSummaryLogsParser = {
      parse: vi.fn()
    }

    mockOrganisationsRepository = {
      findRegistrationById: vi.fn()
    }

    summaryLogId = 'summary-log-123'

    vi.mocked(createMongoClient).mockResolvedValue(mockMongoClient)
    vi.mocked(createS3Client).mockReturnValue(mockS3Client)
    vi.mocked(createSummaryLogsRepository).mockReturnValue(
      () => mockSummaryLogsRepository
    )
    vi.mocked(createUploadsRepository).mockReturnValue(mockUploadsRepository)
    vi.mocked(createSummaryLogsParser).mockReturnValue(mockSummaryLogsParser)
    vi.mocked(createOrganisationsRepository).mockReturnValue(
      () => mockOrganisationsRepository
    )
    vi.mocked(summaryLogsValidator).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should create mongo client as expected', async () => {
    await summaryLogsValidatorWorkerThread(summaryLogId)

    expect(createMongoClient).toHaveBeenCalledWith({
      url: 'mongodb://localhost:27017',
      options: { maxPoolSize: 10 }
    })
  })

  it('should get database with expected name', async () => {
    await summaryLogsValidatorWorkerThread(summaryLogId)

    expect(mockMongoClient.db).toHaveBeenCalledWith('test-db')
  })

  it('should create summary logs repository with db', async () => {
    await summaryLogsValidatorWorkerThread(summaryLogId)

    expect(createSummaryLogsRepository).toHaveBeenCalledWith(mockDb)
  })

  it('should create S3 client with expected config', async () => {
    await summaryLogsValidatorWorkerThread(summaryLogId)

    expect(createS3Client).toHaveBeenCalledWith({
      region: 'eu-west-2',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true
    })
  })

  it('should create uploads repository', async () => {
    await summaryLogsValidatorWorkerThread(summaryLogId)

    expect(createUploadsRepository).toHaveBeenCalledWith(mockS3Client)
  })

  it('should create summary logs parser', async () => {
    await summaryLogsValidatorWorkerThread(summaryLogId)

    expect(createSummaryLogsParser).toHaveBeenCalledWith()
  })

  it('should call validator worker as expected', async () => {
    await summaryLogsValidatorWorkerThread(summaryLogId)

    expect(summaryLogsValidator).toHaveBeenCalledWith({
      summaryLogsRepository: mockSummaryLogsRepository,
      uploadsRepository: mockUploadsRepository,
      summaryLogsParser: mockSummaryLogsParser,
      organisationsRepository: mockOrganisationsRepository,
      summaryLogId
    })
  })

  it('should destroy S3 client once worker completes', async () => {
    await summaryLogsValidatorWorkerThread(summaryLogId)

    expect(mockS3Client.destroy).toHaveBeenCalled()
  })

  it('should close mongo client once worker completes', async () => {
    await summaryLogsValidatorWorkerThread(summaryLogId)

    expect(mockMongoClient.close).toHaveBeenCalled()
  })

  it('should destroy S3 client and close mongo client even if worker fails', async () => {
    vi.mocked(summaryLogsValidator).mockRejectedValue(
      new Error('Worker failed')
    )

    await expect(
      summaryLogsValidatorWorkerThread(summaryLogId)
    ).rejects.toThrow('Worker failed')

    expect(mockS3Client.destroy).toHaveBeenCalled()
    expect(mockMongoClient.close).toHaveBeenCalled()
  })

  it('should destroy S3 client and close mongo client even if repository creation fails', async () => {
    vi.mocked(createSummaryLogsRepository).mockImplementation(() => {
      throw new Error('Repository creation failed')
    })

    await expect(
      summaryLogsValidatorWorkerThread(summaryLogId)
    ).rejects.toThrow('Repository creation failed')

    expect(mockS3Client.destroy).toHaveBeenCalled()
    expect(mockMongoClient.close).toHaveBeenCalled()
  })

  it('should close mongo client even if S3 client creation fails', async () => {
    vi.mocked(createS3Client).mockImplementation(() => {
      throw new Error('S3 client creation failed')
    })

    await expect(
      summaryLogsValidatorWorkerThread(summaryLogId)
    ).rejects.toThrow('S3 client creation failed')

    expect(mockMongoClient.close).toHaveBeenCalled()
  })
})
