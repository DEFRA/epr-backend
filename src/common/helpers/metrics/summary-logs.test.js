import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StorageResolution, Unit } from 'aws-embedded-metrics'
import { config } from '#root/config.js'

const mockPutMetric = vi.fn()
const mockFlush = vi.fn()
const mockLoggerError = vi.fn()

vi.mock(import('aws-embedded-metrics'), async (importOriginal) => {
  const original = await importOriginal()

  return {
    ...original,
    createMetricsLogger: () => ({
      putMetric: mockPutMetric,
      flush: mockFlush
    })
  }
})

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { error: (...args) => mockLoggerError(...args) }
}))

const { summaryLogMetrics } = await import('./summary-logs.js')

describe('summaryLogMetrics', () => {
  beforeEach(() => {
    config.set('isMetricsEnabled', true)
    mockFlush.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('recordStatusTransition', () => {
    it('records metric for preprocessing status', async () => {
      await summaryLogMetrics.recordStatusTransition('preprocessing')

      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.status.preprocessing',
        1,
        Unit.Count,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })

    it('records metric for validated status', async () => {
      await summaryLogMetrics.recordStatusTransition('validated')

      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.status.validated',
        1,
        Unit.Count,
        StorageResolution.Standard
      )
    })

    it('records metric for submitted status', async () => {
      await summaryLogMetrics.recordStatusTransition('submitted')

      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.status.submitted',
        1,
        Unit.Count,
        StorageResolution.Standard
      )
    })

    it('records metric for all valid statuses', async () => {
      const statuses = [
        'preprocessing',
        'rejected',
        'validating',
        'invalid',
        'validated',
        'submitting',
        'submitted',
        'superseded',
        'validation_failed'
      ]

      for (const status of statuses) {
        vi.clearAllMocks()
        await summaryLogMetrics.recordStatusTransition(status)

        expect(mockPutMetric).toHaveBeenCalledWith(
          `summaryLog.status.${status}`,
          1,
          Unit.Count,
          StorageResolution.Standard
        )
      }
    })

    it('does not record metric when metrics disabled', async () => {
      config.set('isMetricsEnabled', false)

      await summaryLogMetrics.recordStatusTransition('validated')

      expect(mockPutMetric).not.toHaveBeenCalled()
      expect(mockFlush).not.toHaveBeenCalled()
    })

    it('logs error when flush fails', async () => {
      const mockError = new Error('flush failed')
      mockFlush.mockRejectedValue(mockError)

      await summaryLogMetrics.recordStatusTransition('validated')

      expect(mockLoggerError).toHaveBeenCalledWith(mockError, 'flush failed')
    })
  })
})
