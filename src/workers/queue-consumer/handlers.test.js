import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCommandHandlers } from './handlers.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'

// Import mocked modules
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'

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

describe('createCommandHandlers', () => {
  let mockLogger
  let mockRepositories
  let mockSummaryLogsRepository
  let mockOrganisationsRepository
  let mockWasteRecordsRepository
  let mockWasteBalancesRepository
  let mockSummaryLogExtractor
  let mockFeatureFlags

  beforeEach(() => {
    vi.clearAllMocks()

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }

    mockSummaryLogsRepository = {
      findById: vi.fn(),
      update: vi.fn()
    }
    mockOrganisationsRepository = {}
    mockWasteRecordsRepository = {}
    mockWasteBalancesRepository = {}
    mockSummaryLogExtractor = {}
    mockFeatureFlags = {}

    mockRepositories = {
      summaryLogsRepository: mockSummaryLogsRepository,
      organisationsRepository: mockOrganisationsRepository,
      wasteRecordsRepository: mockWasteRecordsRepository,
      wasteBalancesRepository: mockWasteBalancesRepository,
      summaryLogExtractor: mockSummaryLogExtractor,
      featureFlags: mockFeatureFlags
    }
  })

  describe('handleValidateCommand', () => {
    it('calls validator with summary log ID', async () => {
      const mockValidate = vi.fn()
      createSummaryLogsValidator.mockReturnValue(mockValidate)

      const { handleValidateCommand } = createCommandHandlers({
        logger: mockLogger,
        repositories: mockRepositories
      })

      await handleValidateCommand({ summaryLogId: 'test-log-123' })

      expect(createSummaryLogsValidator).toHaveBeenCalled()
      expect(mockValidate).toHaveBeenCalledWith('test-log-123')
    })

    it('propagates validation errors', async () => {
      const mockValidate = vi
        .fn()
        .mockRejectedValue(new Error('Validation failed'))
      createSummaryLogsValidator.mockReturnValue(mockValidate)

      const { handleValidateCommand } = createCommandHandlers({
        logger: mockLogger,
        repositories: mockRepositories
      })

      await expect(
        handleValidateCommand({ summaryLogId: 'test-log-123' })
      ).rejects.toThrow('Validation failed')
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
        logger: mockLogger,
        repositories: mockRepositories
      })

      await handleSubmitCommand({ summaryLogId })

      expect(mockSummaryLogsRepository.findById).toHaveBeenCalledWith(
        summaryLogId
      )
      expect(syncFromSummaryLog).toHaveBeenCalled()
    })

    it('updates status to SUBMITTED', async () => {
      const { handleSubmitCommand } = createCommandHandlers({
        logger: mockLogger,
        repositories: mockRepositories
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
        logger: mockLogger,
        repositories: mockRepositories
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
        logger: mockLogger,
        repositories: mockRepositories
      })

      await handleSubmitCommand({ summaryLogId })

      expect(mockLogger.info).toHaveBeenCalledWith({
        message: `Summary log submitted: summaryLogId=${summaryLogId}`
      })
    })

    it('throws if summary log not found', async () => {
      mockSummaryLogsRepository.findById.mockResolvedValue(null)

      const { handleSubmitCommand } = createCommandHandlers({
        logger: mockLogger,
        repositories: mockRepositories
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
        logger: mockLogger,
        repositories: mockRepositories
      })

      await expect(handleSubmitCommand({ summaryLogId })).rejects.toThrow(
        'Summary log must be in submitting status'
      )
    })
  })
})
