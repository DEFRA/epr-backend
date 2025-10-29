import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'

import { SummaryLogUpdater } from './updater.js'

describe('SummaryLogUpdater', () => {
  let summaryLogsRepository
  let summaryLogUpdater
  let summaryLog

  beforeEach(() => {
    summaryLogsRepository = {
      update: vi.fn()
    }

    summaryLogUpdater = new SummaryLogUpdater({
      summaryLogsRepository
    })

    summaryLog = {
      status: SUMMARY_LOG_STATUS.VALIDATING,
      file: {
        id: 'file-123',
        name: 'test.xlsx',
        status: UPLOAD_STATUS.COMPLETE,
        s3: {
          bucket: 'test-bucket',
          key: 'test-key'
        }
      }
    }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should update summary log with given status', async () => {
    await summaryLogUpdater.update({
      id: 'summary-log-123',
      version: 1,
      summaryLog,
      status: SUMMARY_LOG_STATUS.VALIDATED
    })

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      {
        status: SUMMARY_LOG_STATUS.VALIDATED,
        failureReason: undefined
      }
    )
  })

  it('should update summary log with failure reason', async () => {
    await summaryLogUpdater.update({
      id: 'summary-log-123',
      version: 1,
      summaryLog,
      status: SUMMARY_LOG_STATUS.INVALID,
      failureReason: 'Test error'
    })

    expect(summaryLogsRepository.update).toHaveBeenCalledWith(
      'summary-log-123',
      1,
      {
        status: SUMMARY_LOG_STATUS.INVALID,
        failureReason: 'Test error'
      }
    )
  })
})
