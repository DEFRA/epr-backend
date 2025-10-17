import { createMongoClient } from '#common/helpers/mongo-client.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createMockConfig } from '#test/helpers/mock-config.js'

import { summaryLogsValidatorWorker } from './worker.js'
import summaryLogsValidatorWorkerThread from './worker-thread.js'

vi.mock('../../../config.js', () => createMockConfig())
vi.mock('#common/helpers/mongo-client.js')
vi.mock('#repositories/summary-logs/mongodb.js')
vi.mock('./worker.js')
vi.mock('#common/helpers/secure-context.js')

describe('summaryLogsValidatorWorkerThread', () => {
  let mockDb
  let mockMongoClient
  let mockSummaryLogsRepository

  let summaryLog

  beforeEach(() => {
    mockDb = { collection: vi.fn() }

    mockMongoClient = {
      db: vi.fn().mockReturnValue(mockDb),
      close: vi.fn().mockResolvedValue(undefined)
    }

    mockSummaryLogsRepository = {
      updateStatus: vi.fn()
    }

    summaryLog = {
      id: 'summary-log-123',
      status: 'validating'
    }

    vi.mocked(createMongoClient).mockResolvedValue(mockMongoClient)
    vi.mocked(createSummaryLogsRepository).mockReturnValue(
      () => mockSummaryLogsRepository
    )
    vi.mocked(summaryLogsValidatorWorker).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should create mongo client as expected', async () => {
    await summaryLogsValidatorWorkerThread({ summaryLog })

    expect(createMongoClient).toHaveBeenCalledWith({
      url: 'mongodb://localhost:27017',
      options: { maxPoolSize: 10 }
    })
  })

  it('should get database with expected name', async () => {
    await summaryLogsValidatorWorkerThread({ summaryLog })

    expect(mockMongoClient.db).toHaveBeenCalledWith('test-db')
  })

  it('should create summary logs repository with db', async () => {
    await summaryLogsValidatorWorkerThread({ summaryLog })

    expect(createSummaryLogsRepository).toHaveBeenCalledWith(mockDb)
  })

  it('should call validator worker with repository and summary log', async () => {
    await summaryLogsValidatorWorkerThread({ summaryLog })

    expect(summaryLogsValidatorWorker).toHaveBeenCalledWith({
      summaryLogsRepository: mockSummaryLogsRepository,
      summaryLog
    })
  })

  it('should close mongo client once worker completes', async () => {
    await summaryLogsValidatorWorkerThread({ summaryLog })

    expect(mockMongoClient.close).toHaveBeenCalled()
  })

  it('should close mongo client even if worker fails', async () => {
    vi.mocked(summaryLogsValidatorWorker).mockRejectedValue(
      new Error('Worker failed')
    )

    await expect(
      summaryLogsValidatorWorkerThread({ summaryLog })
    ).rejects.toThrow('Worker failed')

    expect(mockMongoClient.close).toHaveBeenCalled()
  })

  it('should close mongo client even if connection fails', async () => {
    vi.mocked(createSummaryLogsRepository).mockImplementation(() => {
      throw new Error('Connection failed')
    })

    await expect(
      summaryLogsValidatorWorkerThread({ summaryLog })
    ).rejects.toThrow('Connection failed')

    expect(mockMongoClient.close).toHaveBeenCalled()
  })
})
