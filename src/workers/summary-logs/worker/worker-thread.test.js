import { createMockConfig } from '#vite/helpers/mock-config.js'
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import { createUploadsRepository } from '#adapters/repositories/uploads/cdp-uploader.js'
import { createMongoClient } from '#common/helpers/mongo-client.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { createWasteBalancesRepository } from '#repositories/waste-balances/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import {
  SUMMARY_LOG_META_FIELDS,
  PROCESSING_TYPES
} from '#domain/summary-logs/meta-fields.js'
import { logger } from '#common/helpers/logging/logger.js'
import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'

import summaryLogsWorkerThread from './worker-thread.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock('#common/helpers/metrics/summary-logs.js', () => ({
  summaryLogMetrics: {
    recordStatusTransition: vi.fn(),
    recordValidationDuration: vi.fn(),
    timedSubmission: vi.fn((_processingType, fn) => fn()),
    recordWasteRecordsCreated: vi.fn(),
    recordWasteRecordsUpdated: vi.fn()
  }
}))
vi.mock('#application/summary-logs/extractor.js')
vi.mock('#application/summary-logs/validate.js')
vi.mock('#application/waste-records/sync-from-summary-log.js')
vi.mock('#adapters/repositories/uploads/cdp-uploader.js')
vi.mock('#common/helpers/mongo-client.js')
vi.mock('#common/helpers/s3/s3-client.js')
vi.mock('#common/helpers/secure-context.js')
vi.mock('#repositories/summary-logs/mongodb.js')
vi.mock('#repositories/organisations/mongodb.js')
vi.mock('#repositories/waste-records/mongodb.js')
vi.mock('#repositories/waste-balances/mongodb.js')
vi.mock('#repositories/system-logs/mongodb.js')
vi.mock('../../../config.js', () => createMockConfig())

describe('summaryLogsWorkerThread', () => {
  let mockDb
  let mockMongoClient
  let mockS3Client
  let mockSystemLogsRepository
  let mockSummaryLogsRepository
  let mockUploadsRepository
  let mockOrganisationsRepository
  let mockWasteRecordsRepository
  let mockWasteBalancesRepository
  let mockSummaryLogExtractor
  let mockSummaryLogsValidator
  let mockSyncFromSummaryLog

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
      findById: vi.fn(),
      update: vi.fn()
    }

    mockSystemLogsRepository = {
      create: vi.fn()
    }

    mockUploadsRepository = {
      findByLocation: vi.fn()
    }

    mockOrganisationsRepository = {
      findRegistrationById: vi.fn()
    }

    mockWasteRecordsRepository = {
      findByRegistration: vi.fn(),
      appendVersions: vi.fn()
    }

    mockWasteBalancesRepository = {
      findByAccreditationId: vi.fn(),
      updateWasteBalanceTransactions: vi.fn()
    }

    mockSummaryLogExtractor = {
      extract: vi.fn()
    }

    mockSummaryLogsValidator = vi.fn().mockResolvedValue(undefined)

    mockSyncFromSummaryLog = vi
      .fn()
      .mockResolvedValue({ created: 0, updated: 0 })

    summaryLogId = 'summary-log-123'

    vi.mocked(createMongoClient).mockResolvedValue(mockMongoClient)
    vi.mocked(createSystemLogsRepository).mockReturnValue(
      () => mockSystemLogsRepository
    )
    vi.mocked(createS3Client).mockReturnValue(mockS3Client)
    vi.mocked(createSummaryLogsRepository).mockReturnValue(
      () => mockSummaryLogsRepository
    )
    vi.mocked(createUploadsRepository).mockReturnValue(mockUploadsRepository)
    vi.mocked(createOrganisationsRepository).mockReturnValue(
      () => mockOrganisationsRepository
    )
    vi.mocked(createWasteRecordsRepository).mockReturnValue(
      () => mockWasteRecordsRepository
    )
    vi.mocked(createWasteBalancesRepository).mockReturnValue(
      () => mockWasteBalancesRepository
    )
    vi.mocked(createSummaryLogExtractor).mockReturnValue(
      mockSummaryLogExtractor
    )
    vi.mocked(createSummaryLogsValidator).mockReturnValue(
      mockSummaryLogsValidator
    )
    vi.mocked(syncFromSummaryLog).mockReturnValue(mockSyncFromSummaryLog)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should create mongo client as expected', async () => {
    await summaryLogsWorkerThread({
      command: 'validate',
      summaryLogId
    })

    expect(createMongoClient).toHaveBeenCalledWith({
      url: 'mongodb://localhost:27017',
      options: { maxPoolSize: 10 }
    })
  })

  it('should get database with expected name', async () => {
    await summaryLogsWorkerThread({
      command: 'validate',
      summaryLogId
    })

    expect(mockMongoClient.db).toHaveBeenCalledWith('test-db')
  })

  it('should create summary logs repository with db', async () => {
    await summaryLogsWorkerThread({
      command: 'validate',
      summaryLogId
    })

    expect(createSummaryLogsRepository).toHaveBeenCalledWith(mockDb)
  })

  it('should create S3 client with expected config', async () => {
    await summaryLogsWorkerThread({
      command: 'validate',
      summaryLogId
    })

    expect(createS3Client).toHaveBeenCalledWith({
      region: 'eu-west-2',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true
    })
  })

  it('should create uploads repository', async () => {
    await summaryLogsWorkerThread({
      command: 'validate',
      summaryLogId
    })

    expect(createUploadsRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        s3Client: mockS3Client
      })
    )
  })

  it('should create summary log extractor', async () => {
    await summaryLogsWorkerThread({
      command: 'validate',
      summaryLogId
    })

    expect(createSummaryLogExtractor).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadsRepository: mockUploadsRepository
      })
    )
  })

  it('should create summary logs validator', async () => {
    await summaryLogsWorkerThread({
      command: 'validate',
      summaryLogId
    })

    expect(createSummaryLogsValidator).toHaveBeenCalledWith({
      summaryLogsRepository: mockSummaryLogsRepository,
      organisationsRepository: mockOrganisationsRepository,
      wasteRecordsRepository: mockWasteRecordsRepository,
      summaryLogExtractor: mockSummaryLogExtractor
    })
  })

  it('should call validator as expected', async () => {
    await summaryLogsWorkerThread({
      command: 'validate',
      summaryLogId
    })

    expect(mockSummaryLogsValidator).toHaveBeenCalledWith(summaryLogId)
  })

  it('should destroy S3 client once worker completes', async () => {
    await summaryLogsWorkerThread({
      command: 'validate',
      summaryLogId
    })

    expect(mockS3Client.destroy).toHaveBeenCalled()
  })

  it('should close mongo client once worker completes', async () => {
    await summaryLogsWorkerThread({
      command: 'validate',
      summaryLogId
    })

    expect(mockMongoClient.close).toHaveBeenCalled()
  })

  it('should destroy S3 client and close mongo client even if worker fails', async () => {
    mockSummaryLogsValidator.mockRejectedValue(new Error('Worker failed'))

    await expect(
      summaryLogsWorkerThread({
        command: 'validate',
        summaryLogId
      })
    ).rejects.toThrow('Worker failed')

    expect(mockS3Client.destroy).toHaveBeenCalled()
    expect(mockMongoClient.close).toHaveBeenCalled()
  })

  it('should destroy S3 client and close mongo client even if repository creation fails', async () => {
    vi.mocked(createSummaryLogsRepository).mockImplementation(() => {
      throw new Error('Repository creation failed')
    })

    await expect(
      summaryLogsWorkerThread({
        command: 'validate',
        summaryLogId
      })
    ).rejects.toThrow('Repository creation failed')

    expect(mockS3Client.destroy).toHaveBeenCalled()
    expect(mockMongoClient.close).toHaveBeenCalled()
  })

  it('should close mongo client even if S3 client creation fails', async () => {
    vi.mocked(createS3Client).mockImplementation(() => {
      throw new Error('S3 client creation failed')
    })

    await expect(
      summaryLogsWorkerThread({
        command: 'validate',
        summaryLogId
      })
    ).rejects.toThrow('S3 client creation failed')

    expect(mockMongoClient.close).toHaveBeenCalled()
  })

  describe('submit command', () => {
    it('should call syncFromSummaryLog when submit command is provided', async () => {
      const summaryLog = {
        status: SUMMARY_LOG_STATUS.SUBMITTING,
        organisationId: 'org-123',
        registrationId: 'reg-456',
        meta: {
          [SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]:
            PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }

      mockSummaryLogsRepository.findById.mockResolvedValue({
        version: 1,
        summaryLog
      })

      await summaryLogsWorkerThread({
        command: 'submit',
        summaryLogId,
        request: { auth: { credentials: { id: 'user-123' } } }
      })

      expect(mockSyncFromSummaryLog).toHaveBeenCalledWith(summaryLog, {
        auth: { credentials: { id: 'user-123' } }
      })
    })

    it('should update summary log status to SUBMITTED', async () => {
      const summaryLog = {
        status: SUMMARY_LOG_STATUS.SUBMITTING,
        organisationId: 'org-123',
        registrationId: 'reg-456',
        meta: {
          [SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]:
            PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }

      mockSummaryLogsRepository.findById.mockResolvedValue({
        version: 1,
        summaryLog
      })

      await summaryLogsWorkerThread({
        command: 'submit',
        summaryLogId
      })

      expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
        summaryLogId,
        1,
        {
          status: SUMMARY_LOG_STATUS.SUBMITTED,
          expiresAt: null
        }
      )
    })

    it('should log submission completion', async () => {
      const summaryLog = {
        status: SUMMARY_LOG_STATUS.SUBMITTING,
        organisationId: 'org-123',
        registrationId: 'reg-456',
        meta: {
          [SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]:
            PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }

      mockSummaryLogsRepository.findById.mockResolvedValue({
        version: 1,
        summaryLog
      })

      await summaryLogsWorkerThread({
        command: 'submit',
        summaryLogId
      })

      expect(logger.info).toHaveBeenCalledWith({
        message: `Summary log submitted: summaryLogId=${summaryLogId}`
      })
    })

    it('should throw error when summary log not found', async () => {
      mockSummaryLogsRepository.findById.mockResolvedValue(null)

      await expect(
        summaryLogsWorkerThread({
          command: 'submit',
          summaryLogId
        })
      ).rejects.toThrow(`Summary log ${summaryLogId} not found`)
    })

    it('should throw error when status is not SUBMITTING', async () => {
      mockSummaryLogsRepository.findById.mockResolvedValue({
        version: 1,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.VALIDATING,
          organisationId: 'org-123',
          registrationId: 'reg-456'
        }
      })

      await expect(
        summaryLogsWorkerThread({
          command: 'submit',
          summaryLogId
        })
      ).rejects.toThrow(
        `Summary log must be in submitting status. Current status: ${SUMMARY_LOG_STATUS.VALIDATING}`
      )
    })

    it('should create wasteRecordsRepository', async () => {
      const summaryLog = {
        status: SUMMARY_LOG_STATUS.SUBMITTING,
        organisationId: 'org-123',
        registrationId: 'reg-456',
        meta: {
          [SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]:
            PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }

      mockSummaryLogsRepository.findById.mockResolvedValue({
        version: 1,
        summaryLog
      })

      await summaryLogsWorkerThread({
        command: 'submit',
        summaryLogId
      })

      expect(createWasteRecordsRepository).toHaveBeenCalledWith(mockDb)
    })

    it('should create syncFromSummaryLog with correct dependencies', async () => {
      const summaryLog = {
        status: SUMMARY_LOG_STATUS.SUBMITTING,
        organisationId: 'org-123',
        registrationId: 'reg-456',
        meta: {
          [SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]:
            PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }

      mockSummaryLogsRepository.findById.mockResolvedValue({
        version: 1,
        summaryLog
      })

      await summaryLogsWorkerThread({
        command: 'submit',
        summaryLogId
      })

      expect(syncFromSummaryLog).toHaveBeenCalledWith({
        extractor: mockSummaryLogExtractor,
        wasteRecordRepository: mockWasteRecordsRepository,
        wasteBalancesRepository: mockWasteBalancesRepository,
        organisationsRepository: mockOrganisationsRepository
      })
    })

    describe('metrics', () => {
      it('should record SUBMITTED status transition metric', async () => {
        const summaryLog = {
          status: SUMMARY_LOG_STATUS.SUBMITTING,
          organisationId: 'org-123',
          registrationId: 'reg-456',
          meta: {
            [SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]:
              PROCESSING_TYPES.REPROCESSOR_INPUT
          }
        }

        mockSummaryLogsRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog
        })

        mockSyncFromSummaryLog.mockResolvedValue({ created: 0, updated: 0 })

        await summaryLogsWorkerThread({
          command: 'submit',
          summaryLogId
        })

        expect(summaryLogMetrics.recordStatusTransition).toHaveBeenCalledWith({
          status: SUMMARY_LOG_STATUS.SUBMITTED,
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        })
      })

      it('should record submission duration via timedSubmission', async () => {
        const summaryLog = {
          status: SUMMARY_LOG_STATUS.SUBMITTING,
          organisationId: 'org-123',
          registrationId: 'reg-456',
          meta: {
            [SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]:
              PROCESSING_TYPES.REPROCESSOR_INPUT
          }
        }

        mockSummaryLogsRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog
        })

        mockSyncFromSummaryLog.mockResolvedValue({ created: 0, updated: 0 })

        await summaryLogsWorkerThread({
          command: 'submit',
          summaryLogId
        })

        expect(summaryLogMetrics.timedSubmission).toHaveBeenCalledWith(
          { processingType: PROCESSING_TYPES.REPROCESSOR_INPUT },
          expect.any(Function)
        )
      })

      it('should record waste records created count', async () => {
        const summaryLog = {
          status: SUMMARY_LOG_STATUS.SUBMITTING,
          organisationId: 'org-123',
          registrationId: 'reg-456',
          meta: {
            [SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]:
              PROCESSING_TYPES.REPROCESSOR_INPUT
          }
        }

        mockSummaryLogsRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog
        })

        mockSyncFromSummaryLog.mockResolvedValue({ created: 5, updated: 3 })

        await summaryLogsWorkerThread({
          command: 'submit',
          summaryLogId
        })

        expect(
          summaryLogMetrics.recordWasteRecordsCreated
        ).toHaveBeenCalledWith(
          { processingType: PROCESSING_TYPES.REPROCESSOR_INPUT },
          5
        )
      })

      it('should record waste records updated count', async () => {
        const summaryLog = {
          status: SUMMARY_LOG_STATUS.SUBMITTING,
          organisationId: 'org-123',
          registrationId: 'reg-456',
          meta: {
            [SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]:
              PROCESSING_TYPES.REPROCESSOR_INPUT
          }
        }

        mockSummaryLogsRepository.findById.mockResolvedValue({
          version: 1,
          summaryLog
        })

        mockSyncFromSummaryLog.mockResolvedValue({ created: 5, updated: 3 })

        await summaryLogsWorkerThread({
          command: 'submit',
          summaryLogId
        })

        expect(
          summaryLogMetrics.recordWasteRecordsUpdated
        ).toHaveBeenCalledWith(
          { processingType: PROCESSING_TYPES.REPROCESSOR_INPUT },
          3
        )
      })
    })
  })

  describe('unknown command', () => {
    it('should throw error when command is unknown', async () => {
      await expect(
        summaryLogsWorkerThread({
          command: 'unknown',
          summaryLogId
        })
      ).rejects.toThrow('Unknown command: unknown')
    })
  })
})
