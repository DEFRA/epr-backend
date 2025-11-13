import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'

import { createInlineSummaryLogsValidator } from './inline.js'

vi.mock('#application/summary-logs/extractor.js')
vi.mock('#application/summary-logs/validate.js')

describe('createInlineSummaryLogsValidator', () => {
  let uploadsRepository
  let summaryLogsRepository
  let organisationsRepository
  let mockSummaryLogExtractor
  let mockSummaryLogsValidator
  let inlineSummaryLogsValidator
  let summaryLogId

  beforeEach(() => {
    uploadsRepository = {
      findByLocation: vi.fn()
    }

    summaryLogsRepository = {
      updateStatus: vi.fn()
    }

    organisationsRepository = {
      findRegistrationById: vi.fn()
    }

    mockSummaryLogExtractor = {
      extract: vi.fn()
    }

    mockSummaryLogsValidator = vi.fn().mockResolvedValue(undefined)

    vi.mocked(createSummaryLogExtractor).mockImplementation(
      () => mockSummaryLogExtractor
    )
    vi.mocked(createSummaryLogsValidator).mockReturnValue(
      mockSummaryLogsValidator
    )

    inlineSummaryLogsValidator = createInlineSummaryLogsValidator(
      uploadsRepository,
      summaryLogsRepository,
      organisationsRepository
    )

    summaryLogId = 'summary-log-123'
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should create summary log extractor with dependencies', () => {
    expect(createSummaryLogExtractor).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadsRepository
      })
    )
  })

  it('should create summary logs validator with dependencies', () => {
    expect(createSummaryLogsValidator).toHaveBeenCalledWith({
      summaryLogsRepository,
      organisationsRepository,
      summaryLogExtractor: mockSummaryLogExtractor
    })
  })

  it('should call validator with summary log id', async () => {
    await inlineSummaryLogsValidator.validate(summaryLogId)

    expect(mockSummaryLogsValidator).toHaveBeenCalledWith(summaryLogId)
  })

  it('should log error with correct format when worker fails', async () => {
    mockSummaryLogsValidator.mockRejectedValue(new Error('Worker failed'))

    // Need to import logger to spy on it
    const { logger } = await import('#common/helpers/logging/logger.js')
    vi.spyOn(logger, 'error')

    await inlineSummaryLogsValidator.validate(summaryLogId)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Summary log validation worker failed: summaryLogId=summary-log-123'
      })
    )
  })

  it('should not throw when worker succeeds', async () => {
    await expect(
      inlineSummaryLogsValidator.validate(summaryLogId)
    ).resolves.toBeUndefined()
  })

  it('should not throw when worker fails', async () => {
    mockSummaryLogsValidator.mockRejectedValue(new Error('Worker failed'))

    await expect(
      inlineSummaryLogsValidator.validate(summaryLogId)
    ).resolves.toBeUndefined()
  })

  it('should throw error when submit is called', async () => {
    await expect(
      inlineSummaryLogsValidator.submit(summaryLogId)
    ).rejects.toThrow('Inline validator does not support submit operation')
  })
})
