import { summaryLogsValidator } from '#application/summary-logs/validator.js'

import { createInlineSummaryLogsValidator } from './inline.js'

vi.mock('#application/summary-logs/validator.js')

describe('createInlineSummaryLogsValidator', () => {
  let uploadsRepository
  let summaryLogsParser
  let summaryLogsRepository
  let organisationsRepository
  let inlineSummaryLogsValidator
  let summaryLogId

  beforeEach(() => {
    uploadsRepository = {
      findByLocation: vi.fn()
    }

    summaryLogsParser = {
      parse: vi.fn()
    }

    summaryLogsRepository = {
      updateStatus: vi.fn()
    }

    organisationsRepository = {
      findRegistrationById: vi.fn()
    }

    inlineSummaryLogsValidator = createInlineSummaryLogsValidator(
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      organisationsRepository
    )

    summaryLogId = 'summary-log-123'

    vi.mocked(summaryLogsValidator).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should call worker with repository and summary log', async () => {
    await inlineSummaryLogsValidator.validate(summaryLogId)

    expect(summaryLogsValidator).toHaveBeenCalledWith({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      organisationsRepository,
      summaryLogId
    })
  })

  it('should log error with correct format when worker fails', async () => {
    vi.mocked(summaryLogsValidator).mockRejectedValue(
      new Error('Worker failed')
    )

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
    vi.mocked(summaryLogsValidator).mockRejectedValue(
      new Error('Worker failed')
    )

    await expect(
      inlineSummaryLogsValidator.validate(summaryLogId)
    ).resolves.toBeUndefined()
  })
})
