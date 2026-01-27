import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCommandHandlers } from './handlers.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'

// Import mocked modules
import { createMongoClient } from '#common/helpers/mongo-client.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { createWasteBalancesRepository } from '#repositories/waste-balances/mongodb.js'
import { createUploadsRepository } from '#adapters/repositories/uploads/cdp-uploader.js'
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'

// Mock all external dependencies
vi.mock('#common/helpers/mongo-client.js', () => ({
  createMongoClient: vi.fn()
}))

vi.mock('#common/helpers/s3/s3-client.js', () => ({
  createS3Client: vi.fn()
}))

vi.mock('#repositories/summary-logs/mongodb.js', () => ({
  createSummaryLogsRepository: vi.fn()
}))

vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))

vi.mock('#repositories/waste-records/mongodb.js', () => ({
  createWasteRecordsRepository: vi.fn()
}))

vi.mock('#repositories/waste-balances/mongodb.js', () => ({
  createWasteBalancesRepository: vi.fn()
}))

vi.mock('#adapters/repositories/uploads/cdp-uploader.js', () => ({
  createUploadsRepository: vi.fn()
}))

vi.mock('#application/summary-logs/extractor.js', () => ({
  createSummaryLogExtractor: vi.fn()
}))

vi.mock('#application/summary-logs/validate.js', () => ({
  createSummaryLogsValidator: vi.fn()
}))

vi.mock('#application/waste-records/sync-from-summary-log.js', () => ({
  syncFromSummaryLog: vi.fn()
}))

vi.mock('#common/helpers/metrics/summary-logs.js', () => ({
  summaryLogMetrics: {
    timedSubmission: vi.fn((_, fn) => fn()),
    recordWasteRecordsCreated: vi.fn(),
    recordWasteRecordsUpdated: vi.fn(),
    recordStatusTransition: vi.fn()
  }
}))

vi.mock('#feature-flags/feature-flags.config.js', () => ({
  createConfigFeatureFlags: vi.fn(() => ({}))
}))

describe('createCommandHandlers', () => {
  let mockLogger
  let mockMongoClient
  let mockS3Client
  let mockDb
  let mockSummaryLogsRepository
  let mockOrganisationsRepository
  let mockWasteRecordsRepository
  let mockWasteBalancesRepository

  beforeEach(() => {
    vi.clearAllMocks()

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }

    mockDb = { collection: vi.fn() }
    mockMongoClient = {
      db: vi.fn().mockReturnValue(mockDb),
      close: vi.fn()
    }
    mockS3Client = { destroy: vi.fn() }

    mockSummaryLogsRepository = {
      findById: vi.fn(),
      update: vi.fn()
    }
    mockOrganisationsRepository = {}
    mockWasteRecordsRepository = {}
    mockWasteBalancesRepository = {}

    createMongoClient.mockResolvedValue(mockMongoClient)
    createS3Client.mockReturnValue(mockS3Client)
    createSummaryLogsRepository.mockResolvedValue(
      () => mockSummaryLogsRepository
    )
    createOrganisationsRepository.mockResolvedValue(
      () => mockOrganisationsRepository
    )
    createWasteRecordsRepository.mockResolvedValue(
      () => mockWasteRecordsRepository
    )
    createWasteBalancesRepository.mockResolvedValue(
      () => mockWasteBalancesRepository
    )
    createUploadsRepository.mockReturnValue({})
    createSummaryLogExtractor.mockReturnValue({})
  })

  describe('handleValidateCommand', () => {
    it('calls validator with summary log ID', async () => {
      const mockValidate = vi.fn()
      createSummaryLogsValidator.mockReturnValue(mockValidate)

      const { handleValidateCommand } = createCommandHandlers({
        logger: mockLogger
      })

      await handleValidateCommand({ summaryLogId: 'test-log-123' })

      expect(createSummaryLogsValidator).toHaveBeenCalled()
      expect(mockValidate).toHaveBeenCalledWith('test-log-123')
    })

    it('cleans up connections after validation', async () => {
      const mockValidate = vi.fn()
      createSummaryLogsValidator.mockReturnValue(mockValidate)

      const { handleValidateCommand } = createCommandHandlers({
        logger: mockLogger
      })

      await handleValidateCommand({ summaryLogId: 'test-log-123' })

      expect(mockS3Client.destroy).toHaveBeenCalled()
      expect(mockMongoClient.close).toHaveBeenCalled()
    })

    it('cleans up connections even if validation fails', async () => {
      const mockValidate = vi
        .fn()
        .mockRejectedValue(new Error('Validation failed'))
      createSummaryLogsValidator.mockReturnValue(mockValidate)

      const { handleValidateCommand } = createCommandHandlers({
        logger: mockLogger
      })

      await expect(
        handleValidateCommand({ summaryLogId: 'test-log-123' })
      ).rejects.toThrow('Validation failed')

      expect(mockS3Client.destroy).toHaveBeenCalled()
      expect(mockMongoClient.close).toHaveBeenCalled()
    })
  })

  describe('handleSubmitCommand', () => {
    const summaryLogId = 'submit-log-456'
    const summaryLog = {
      status: SUMMARY_LOG_STATUS.SUBMITTING,
      meta: {
        [SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]: 'REPROCESSOR_INPUT'
      }
    }

    beforeEach(() => {
      mockSummaryLogsRepository.findById.mockResolvedValue({
        version: 1,
        summaryLog
      })

      syncFromSummaryLog.mockReturnValue(
        vi.fn().mockResolvedValue({ created: 5, updated: 3 })
      )
    })

    it('syncs waste records from summary log', async () => {
      const { handleSubmitCommand } = createCommandHandlers({
        logger: mockLogger
      })

      await handleSubmitCommand({ summaryLogId })

      expect(mockSummaryLogsRepository.findById).toHaveBeenCalledWith(
        summaryLogId
      )
      expect(syncFromSummaryLog).toHaveBeenCalled()
    })

    it('updates status to SUBMITTED', async () => {
      const { handleSubmitCommand } = createCommandHandlers({
        logger: mockLogger
      })

      await handleSubmitCommand({ summaryLogId })

      expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
        summaryLogId,
        1,
        expect.objectContaining({ status: SUMMARY_LOG_STATUS.SUBMITTED })
      )
    })

    it('records metrics', async () => {
      const { handleSubmitCommand } = createCommandHandlers({
        logger: mockLogger
      })

      await handleSubmitCommand({ summaryLogId })

      expect(summaryLogMetrics.timedSubmission).toHaveBeenCalled()
      expect(summaryLogMetrics.recordWasteRecordsCreated).toHaveBeenCalledWith(
        { processingType: 'REPROCESSOR_INPUT' },
        5
      )
      expect(summaryLogMetrics.recordWasteRecordsUpdated).toHaveBeenCalledWith(
        { processingType: 'REPROCESSOR_INPUT' },
        3
      )
      expect(summaryLogMetrics.recordStatusTransition).toHaveBeenCalledWith({
        status: SUMMARY_LOG_STATUS.SUBMITTED,
        processingType: 'REPROCESSOR_INPUT'
      })
    })

    it('logs submission success', async () => {
      const { handleSubmitCommand } = createCommandHandlers({
        logger: mockLogger
      })

      await handleSubmitCommand({ summaryLogId })

      expect(mockLogger.info).toHaveBeenCalledWith({
        message: `Summary log submitted: summaryLogId=${summaryLogId}`
      })
    })

    it('throws if summary log not found', async () => {
      mockSummaryLogsRepository.findById.mockResolvedValue(null)

      const { handleSubmitCommand } = createCommandHandlers({
        logger: mockLogger
      })

      await expect(handleSubmitCommand({ summaryLogId })).rejects.toThrow(
        `Summary log ${summaryLogId} not found`
      )
    })

    it('throws if summary log not in SUBMITTING status', async () => {
      mockSummaryLogsRepository.findById.mockResolvedValue({
        version: 1,
        summaryLog: { status: SUMMARY_LOG_STATUS.VALIDATED }
      })

      const { handleSubmitCommand } = createCommandHandlers({
        logger: mockLogger
      })

      await expect(handleSubmitCommand({ summaryLogId })).rejects.toThrow(
        'Summary log must be in submitting status'
      )
    })

    it('cleans up connections after submission', async () => {
      const { handleSubmitCommand } = createCommandHandlers({
        logger: mockLogger
      })

      await handleSubmitCommand({ summaryLogId })

      expect(mockS3Client.destroy).toHaveBeenCalled()
      expect(mockMongoClient.close).toHaveBeenCalled()
    })

    it('cleans up connections even if submission fails', async () => {
      mockSummaryLogsRepository.findById.mockRejectedValue(
        new Error('DB error')
      )

      const { handleSubmitCommand } = createCommandHandlers({
        logger: mockLogger
      })

      await expect(handleSubmitCommand({ summaryLogId })).rejects.toThrow(
        'DB error'
      )

      expect(mockS3Client.destroy).toHaveBeenCalled()
      expect(mockMongoClient.close).toHaveBeenCalled()
    })
  })
})
