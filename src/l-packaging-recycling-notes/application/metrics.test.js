import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StorageResolution, Unit } from 'aws-embedded-metrics'
import { config } from '#root/config.js'
import { PRN_STATUS } from '#l-packaging-recycling-notes/domain/model.js'

const mockPutMetric = vi.fn()
const mockPutDimensions = vi.fn()
const mockFlush = vi.fn()
const mockLoggerError = vi.fn()

vi.mock(import('aws-embedded-metrics'), async (importOriginal) => {
  const original = await importOriginal()

  return {
    ...original,
    createMetricsLogger: () => ({
      putMetric: mockPutMetric,
      putDimensions: mockPutDimensions,
      flush: mockFlush
    })
  }
})

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { error: (...args) => mockLoggerError(...args) }
}))

const { prnMetrics } = await import('./metrics.js')

describe('prnMetrics', () => {
  beforeEach(() => {
    config.set('isMetricsEnabled', true)
    mockFlush.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('recordStatusTransition', () => {
    it('records metric with fromStatus and toStatus dimensions', async () => {
      await prnMetrics.recordStatusTransition({
        fromStatus: PRN_STATUS.DRAFT,
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        fromStatus: 'draft',
        toStatus: 'awaiting_authorisation'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'prn.statusTransition',
        1,
        Unit.Count,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })

    it('records metric with all optional dimensions when provided', async () => {
      await prnMetrics.recordStatusTransition({
        fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        toStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        material: 'paper',
        isExport: false
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        fromStatus: 'awaiting_authorisation',
        toStatus: 'awaiting_acceptance',
        material: 'paper',
        isExport: 'false'
      })
    })

    it('records metric with export flag as string dimension', async () => {
      await prnMetrics.recordStatusTransition({
        fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        toStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        isExport: true
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        fromStatus: 'awaiting_authorisation',
        toStatus: 'awaiting_acceptance',
        isExport: 'true'
      })
    })

    it('omits optional dimensions when not provided', async () => {
      await prnMetrics.recordStatusTransition({
        fromStatus: PRN_STATUS.DRAFT,
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        fromStatus: 'draft',
        toStatus: 'awaiting_authorisation'
      })
    })

    it('records metric with correct dimensions for all valid status transitions', async () => {
      const transitions = [
        {
          from: PRN_STATUS.DRAFT,
          to: PRN_STATUS.AWAITING_AUTHORISATION
        },
        {
          from: PRN_STATUS.DRAFT,
          to: PRN_STATUS.CANCELLED
        },
        {
          from: PRN_STATUS.AWAITING_AUTHORISATION,
          to: PRN_STATUS.AWAITING_ACCEPTANCE
        },
        {
          from: PRN_STATUS.AWAITING_AUTHORISATION,
          to: PRN_STATUS.CANCELLED
        }
      ]

      for (const { from, to } of transitions) {
        vi.clearAllMocks()
        await prnMetrics.recordStatusTransition({
          fromStatus: from,
          toStatus: to
        })

        expect(mockPutDimensions).toHaveBeenCalledWith({
          fromStatus: from,
          toStatus: to
        })
        expect(mockPutMetric).toHaveBeenCalledWith(
          'prn.statusTransition',
          1,
          Unit.Count,
          StorageResolution.Standard
        )
      }
    })

    it('does not record metric when metrics disabled', async () => {
      config.set('isMetricsEnabled', false)

      await prnMetrics.recordStatusTransition({
        fromStatus: PRN_STATUS.DRAFT,
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION
      })

      expect(mockPutMetric).not.toHaveBeenCalled()
      expect(mockPutDimensions).not.toHaveBeenCalled()
      expect(mockFlush).not.toHaveBeenCalled()
    })

    it('logs error when flush fails', async () => {
      const mockError = new Error('flush failed')
      mockFlush.mockRejectedValue(mockError)

      await prnMetrics.recordStatusTransition({
        fromStatus: PRN_STATUS.DRAFT,
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION
      })

      expect(mockLoggerError).toHaveBeenCalledWith(mockError, 'flush failed')
    })
  })
})
