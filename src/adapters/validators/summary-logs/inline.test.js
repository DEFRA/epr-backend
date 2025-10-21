import { summaryLogsValidatorWorker } from '#workers/summary-logs/worker/worker.js'

import { createInlineSummaryLogsValidator } from './inline.js'

vi.mock('#workers/summary-logs/worker/worker.js')

describe('createInlineSummaryLogsValidator', () => {
  let uploadsRepository
  let summaryLogsParser
  let summaryLogsRepository
  let summaryLogsValidator
  let validationRequest

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

    validationRequest = {
      id: 'summary-log-123',
      version: 1,
      summaryLog: {
        status: 'validating'
      }
    }

    vi.mocked(summaryLogsValidatorWorker).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should call worker with repository and summary log', async () => {
    await summaryLogsValidator.validate(validationRequest)

    expect(summaryLogsValidatorWorker).toHaveBeenCalledWith({
      uploadsRepository,
      summaryLogsParser,
      summaryLogsRepository,
      id: validationRequest.id,
      version: validationRequest.version,
      summaryLog: validationRequest.summaryLog
    })
  })

  it('should log error with correct format when worker fails', async () => {
    vi.mocked(summaryLogsValidatorWorker).mockRejectedValue(
      new Error('Worker failed')
    )

    // Need to import logger to spy on it
    const { logger } = await import('#common/helpers/logging/logger.js')
    vi.spyOn(logger, 'error')

    await summaryLogsValidator.validate(validationRequest)
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
      summaryLogsValidator.validate(validationRequest)
    ).resolves.toBeUndefined()
  })

  it('should not throw when worker fails', async () => {
    vi.mocked(summaryLogsValidatorWorker).mockRejectedValue(
      new Error('Worker failed')
    )

    await expect(
      summaryLogsValidator.validate(validationRequest)
    ).resolves.toBeUndefined()
  })
})
