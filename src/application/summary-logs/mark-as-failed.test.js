import { vi, describe, it, expect } from 'vitest'

import {
  markAsSubmissionFailed,
  markAsValidationFailed
} from './mark-as-failed.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { createMockLogger } from '#test/mock-logger.js'
import { createMockSummaryLogsRepository } from '#test/mock-repositories.js'

const mockRecordStatusTransition = vi.fn()

vi.mock('./metrics.js', () => ({
  summaryLogMetrics: {
    recordStatusTransition: (...args) => mockRecordStatusTransition(...args)
  }
}))

describe('markAsSubmissionFailed', () => {
  it('logs error when repository.update throws', async () => {
    const summaryLogId = 'test-id'
    const logger = createMockLogger()
    const repository = createMockSummaryLogsRepository({
      findById: vi.fn().mockResolvedValue({
        version: 1,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.SUBMITTING,
          meta: { PROCESSING_TYPE: 'exporter' }
        }
      }),
      update: vi.fn().mockRejectedValue(new Error('db error'))
    })

    await markAsSubmissionFailed(summaryLogId, repository, logger)

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        message: `Failed to mark summary log as submission_failed, summaryLogId=${summaryLogId}`
      })
    )
    expect(mockRecordStatusTransition).not.toHaveBeenCalled()
  })
})

describe('markAsValidationFailed', () => {
  it('records a validation_failed status transition metric', async () => {
    const summaryLogId = 'test-id'
    const logger = createMockLogger()
    const repository = createMockSummaryLogsRepository({
      findById: vi.fn().mockResolvedValue({
        version: 1,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.VALIDATING,
          meta: { PROCESSING_TYPE: 'reprocessor_input' }
        }
      }),
      update: vi.fn().mockResolvedValue(undefined)
    })

    await markAsValidationFailed(summaryLogId, repository, logger)

    expect(mockRecordStatusTransition).toHaveBeenCalledWith({
      status: SUMMARY_LOG_STATUS.VALIDATION_FAILED,
      processingType: 'reprocessor_input'
    })
  })
})
