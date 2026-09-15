import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StorageResolution, Unit } from 'aws-embedded-metrics'
import { config } from '#root/config.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

/** @import { MetricsLogger } from 'aws-embedded-metrics' */

const mockPutMetric = vi.fn()
const mockPutDimensions = vi.fn()
const mockFlush = vi.fn()
const mockLoggerError = vi.fn()

vi.mock(import('aws-embedded-metrics'), async (importOriginal) => {
  const original = await importOriginal()

  return {
    ...original,
    createMetricsLogger: () =>
      /** @type {MetricsLogger} */ (
        /** @type {unknown} */ ({
          putMetric: mockPutMetric,
          putDimensions: mockPutDimensions,
          flush: mockFlush
        })
      )
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
    it('records metric with fromStatus, toStatus and isDecemberWaste dimensions', async () => {
      await prnMetrics.recordStatusTransition({
        fromStatus: PRN_STATUS.DRAFT,
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        isDecemberWaste: false,
        isAcceptedIntoNextObligationYear: false
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        fromStatus: 'draft',
        toStatus: 'awaiting_authorisation',
        isDecemberWaste: 'false',
        isAcceptedIntoNextObligationYear: 'false'
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
        isDecemberWaste: true,
        isAcceptedIntoNextObligationYear: false
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        fromStatus: 'awaiting_authorisation',
        toStatus: 'awaiting_acceptance',
        material: 'paper',
        isDecemberWaste: 'true',
        isAcceptedIntoNextObligationYear: 'false'
      })
    })

    it('omits optional dimensions when not provided', async () => {
      await prnMetrics.recordStatusTransition({
        fromStatus: PRN_STATUS.DRAFT,
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        isDecemberWaste: false,
        isAcceptedIntoNextObligationYear: false
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        fromStatus: 'draft',
        toStatus: 'awaiting_authorisation',
        isDecemberWaste: 'false',
        isAcceptedIntoNextObligationYear: 'false'
      })
    })

    it('records isDecemberWaste as true when the PRN is December waste', async () => {
      await prnMetrics.recordStatusTransition({
        fromStatus: PRN_STATUS.DRAFT,
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        isDecemberWaste: true,
        isAcceptedIntoNextObligationYear: false
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        fromStatus: 'draft',
        toStatus: 'awaiting_authorisation',
        isDecemberWaste: 'true',
        isAcceptedIntoNextObligationYear: 'false'
      })
    })

    it('records isAcceptedIntoNextObligationYear as true when the PRN is accepted into the following obligation year', async () => {
      await prnMetrics.recordStatusTransition({
        fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        toStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        isDecemberWaste: true,
        isAcceptedIntoNextObligationYear: true
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        fromStatus: 'awaiting_authorisation',
        toStatus: 'awaiting_acceptance',
        isDecemberWaste: 'true',
        isAcceptedIntoNextObligationYear: 'true'
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
          toStatus: to,
          isDecemberWaste: false,
          isAcceptedIntoNextObligationYear: false
        })

        expect(mockPutDimensions).toHaveBeenCalledWith({
          fromStatus: from,
          toStatus: to,
          isDecemberWaste: 'false',
          isAcceptedIntoNextObligationYear: 'false'
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
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        isDecemberWaste: false,
        isAcceptedIntoNextObligationYear: false
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
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        isDecemberWaste: false,
        isAcceptedIntoNextObligationYear: false
      })

      expect(mockLoggerError).toHaveBeenCalledWith({
        message: 'flush failed',
        err: mockError
      })
    })
  })

  describe('recordCreated', () => {
    it('records metric with isDecemberWaste and processingType dimensions', async () => {
      await prnMetrics.recordCreated({
        material: 'paper',
        isDecemberWaste: true,
        processingType: PROCESSING_TYPES.EXPORTER
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        material: 'paper',
        isDecemberWaste: 'true',
        processingType: 'exporter'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'prn.created',
        1,
        Unit.Count,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })

    it('records isDecemberWaste as false for a non-December PRN', async () => {
      await prnMetrics.recordCreated({
        material: 'plastic',
        isDecemberWaste: false,
        processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        material: 'plastic',
        isDecemberWaste: 'false',
        processingType: 'reprocessor_output'
      })
    })

    it('does not record metric when metrics disabled', async () => {
      config.set('isMetricsEnabled', false)

      await prnMetrics.recordCreated({
        isDecemberWaste: false,
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
      })

      expect(mockPutMetric).not.toHaveBeenCalled()
      expect(mockPutDimensions).not.toHaveBeenCalled()
      expect(mockFlush).not.toHaveBeenCalled()
    })
  })
})
