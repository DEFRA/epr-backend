import { vi, describe, it, expect } from 'vitest'

import { markAsSubmissionFailed } from './mark-as-failed.js'
import { SUMMARY_LOG_STATUS } from './status.js'

describe('markAsSubmissionFailed', () => {
  it('logs error when repository.update throws', async () => {
    const summaryLogId = 'test-id'
    const logger = { error: vi.fn(), warn: vi.fn() }
    const repository = {
      findById: vi.fn().mockResolvedValue({
        version: 1,
        summaryLog: { status: SUMMARY_LOG_STATUS.SUBMITTING }
      }),
      update: vi.fn().mockRejectedValue(new Error('db error'))
    }

    await markAsSubmissionFailed(summaryLogId, repository, logger)

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        message: `Failed to mark summary log as submission_failed, summaryLogId=${summaryLogId}`
      })
    )
  })
})
