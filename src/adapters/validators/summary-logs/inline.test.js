import { summaryLogsValidatorWorker } from '#workers/summary-logs/worker/worker.js'

import { createInlineSummaryLogsValidator } from './inline.js'

vi.mock('#workers/summary-logs/worker/worker.js')

describe('createInlineSummaryLogsValidator', () => {
  let uploadsRepository
  let summaryLogsParser
  let summaryLogsRepository
  let summaryLogsValidator
  let summaryLog

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
      summaryLogsParser,
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
