import { summaryLogsValidatorWorker } from '#workers/summary-logs/worker/worker.js'

import { createInlineSummaryLogsValidator } from './inline.js'

vi.mock('#workers/summary-logs/worker/worker.js')

describe('createInlineSummaryLogsValidator', () => {
  let summaryLogsRepository
  let summaryLogsValidator
  let validationRequest

  beforeEach(() => {
    summaryLogsRepository = {
      updateStatus: vi.fn()
    }

    summaryLogsValidator = createInlineSummaryLogsValidator(
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
      summaryLogsRepository,
      id: validationRequest.id,
      version: validationRequest.version,
      summaryLog: validationRequest.summaryLog
    })
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
