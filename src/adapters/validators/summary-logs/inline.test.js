import { summaryLogsValidatorWorker } from '#workers/summary-logs/worker/worker.js'

import { createInlineSummaryLogsValidator } from './inline.js'

vi.mock('#workers/summary-logs/worker/worker.js')

describe('createInlineSummaryLogsValidator', () => {
  let uploadsRepository
  let summaryLogsParser
  let summaryLogsRepository
  let summaryLogsValidator
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

    summaryLogsValidator = createInlineSummaryLogsValidator(
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository
    )

    summaryLogId = 'summary-log-123'

    vi.mocked(summaryLogsValidatorWorker).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should call worker with repository and summary log', async () => {
    await summaryLogsValidator.validate(summaryLogId)

    expect(summaryLogsValidatorWorker).toHaveBeenCalledWith({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      summaryLogId
    })
  })

  it('should log error with correct format when worker fails', async () => {
    vi.mocked(summaryLogsValidatorWorker).mockRejectedValue(
      new Error('Worker failed')
    )

    // Need to import logger to spy on it
    const { logger } = await import('#common/helpers/logging/logger.js')
    vi.spyOn(logger, 'error')

    await summaryLogsValidator.validate(summaryLogId)
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
      summaryLogsValidator.validate(summaryLogId)
    ).resolves.toBeUndefined()
  })

  it('should not throw when worker fails', async () => {
    vi.mocked(summaryLogsValidatorWorker).mockRejectedValue(
      new Error('Worker failed')
    )

    await expect(
      summaryLogsValidator.validate(summaryLogId)
    ).resolves.toBeUndefined()
  })
})
