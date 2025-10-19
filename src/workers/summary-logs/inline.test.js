import { summaryLogsValidatorWorker } from '#workers/summary-logs/worker/worker.js'

import { createInlineSummaryLogsValidator } from './inline.js'

vi.mock('#workers/summary-logs/worker/worker.js')

describe('createInlineSummaryLogsValidator', () => {
  let summaryLogsRepository
  let uploadsRepository
  let summaryLogsValidator
  let summaryLog

  beforeEach(() => {
    summaryLogsRepository = {
      updateStatus: vi.fn()
    }

    uploadsRepository = {
      findByLocation: vi.fn()
    }

    summaryLogsValidator = createInlineSummaryLogsValidator(
      summaryLogsRepository,
      uploadsRepository
    )

    summaryLog = {
      id: 'summary-log-123',
      status: 'validating'
    }

    vi.mocked(summaryLogsValidatorWorker).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should call worker with repository and summary log', async () => {
    await summaryLogsValidator.validate(summaryLog)

    expect(summaryLogsValidatorWorker).toHaveBeenCalledWith({
      summaryLogsRepository,
      summaryLog,
      uploadsRepository
    })
  })

  it('should not throw when worker succeeds', async () => {
    await expect(
      summaryLogsValidator.validate(summaryLog)
    ).resolves.toBeUndefined()
  })

  it('should not throw when worker fails', async () => {
    vi.mocked(summaryLogsValidatorWorker).mockRejectedValue(
      new Error('Worker failed')
    )

    await expect(
      summaryLogsValidator.validate(summaryLog)
    ).resolves.toBeUndefined()
  })
})
