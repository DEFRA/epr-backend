import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StorageResolution, Unit } from 'aws-embedded-metrics'
import { config } from '#root/config.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import {
  VALIDATION_SEVERITY,
  VALIDATION_CATEGORY
} from '#common/enums/validation.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

const mockPutMetric = vi.fn()
const mockPutDimensions = vi.fn()
const mockFlush = vi.fn()
const mockLoggerError = vi.fn()
const mockTimed = vi.fn(async (_name, _dimensions, fn) => fn())

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

vi.mock('#common/helpers/metrics.js', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    timed: (...args) => mockTimed(...args)
  }
})

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
    it('records metric with status and processingType dimensions', async () => {
      await summaryLogMetrics.recordStatusTransition({
        status: 'preprocessing',
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        status: 'preprocessing',
        processingType: 'reprocessor_input'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.statusTransition',
        1,
        Unit.Count,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })

    it('lowercases processingType enum values', async () => {
      await summaryLogMetrics.recordStatusTransition({
        status: 'validated',
        processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        status: 'validated',
        processingType: 'reprocessor_output'
      })
    })

    it('handles exporter processingType', async () => {
      await summaryLogMetrics.recordStatusTransition({
        status: 'submitted',
        processingType: PROCESSING_TYPES.EXPORTER
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        status: 'submitted',
        processingType: 'exporter'
      })
    })

    it('omits processingType dimension for early lifecycle states', async () => {
      await summaryLogMetrics.recordStatusTransition({ status: 'validating' })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        status: 'validating'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.statusTransition',
        1,
        Unit.Count,
        StorageResolution.Standard
      )
    })

    it('records metric with correct dimensions for all valid statuses', async () => {
      const statuses = [
        'preprocessing',
        'rejected',
        'validating',
        'invalid',
        'validated',
        'submitting',
        'submitted',
        'superseded',
        'validation_failed',
        'submission_failed'
      ]

      for (const status of statuses) {
        vi.clearAllMocks()
        await summaryLogMetrics.recordStatusTransition({
          status,
          processingType: PROCESSING_TYPES.EXPORTER
        })

        expect(mockPutDimensions).toHaveBeenCalledWith({
          status,
          processingType: 'exporter'
        })
        expect(mockPutMetric).toHaveBeenCalledWith(
          'summaryLog.statusTransition',
          1,
          Unit.Count,
          StorageResolution.Standard
        )
      }
    })

    it('does not record metric when metrics disabled', async () => {
      config.set('isMetricsEnabled', false)

      await summaryLogMetrics.recordStatusTransition({
        status: 'validated',
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
      })

      expect(mockPutMetric).not.toHaveBeenCalled()
      expect(mockPutDimensions).not.toHaveBeenCalled()
      expect(mockFlush).not.toHaveBeenCalled()
    })

    it('logs error when flush fails', async () => {
      const mockError = new Error('flush failed')
      mockFlush.mockRejectedValue(mockError)

      await summaryLogMetrics.recordStatusTransition({
        status: 'validated',
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
      })

      expect(mockLoggerError).toHaveBeenCalledWith(mockError, 'flush failed')
    })
  })

  describe('recordWasteRecordsCreated', () => {
    it('records metric with count, operation and processingType dimensions', async () => {
      await summaryLogMetrics.recordWasteRecordsCreated(
        { processingType: PROCESSING_TYPES.REPROCESSOR_INPUT },
        42
      )

      expect(mockPutDimensions).toHaveBeenCalledWith({
        operation: 'created',
        processingType: 'reprocessor_input'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.wasteRecords',
        42,
        Unit.Count,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })

    it('records zero when no records created', async () => {
      await summaryLogMetrics.recordWasteRecordsCreated(
        { processingType: PROCESSING_TYPES.EXPORTER },
        0
      )

      expect(mockPutDimensions).toHaveBeenCalledWith({
        operation: 'created',
        processingType: 'exporter'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.wasteRecords',
        0,
        Unit.Count,
        StorageResolution.Standard
      )
    })

    it('does not record metric when metrics disabled', async () => {
      config.set('isMetricsEnabled', false)

      await summaryLogMetrics.recordWasteRecordsCreated(
        { processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT },
        10
      )

      expect(mockPutMetric).not.toHaveBeenCalled()
      expect(mockPutDimensions).not.toHaveBeenCalled()
    })
  })

  describe('recordWasteRecordsUpdated', () => {
    it('records metric with count, operation and processingType dimensions', async () => {
      await summaryLogMetrics.recordWasteRecordsUpdated(
        { processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT },
        15
      )

      expect(mockPutDimensions).toHaveBeenCalledWith({
        operation: 'updated',
        processingType: 'reprocessor_output'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.wasteRecords',
        15,
        Unit.Count,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })

    it('records zero when no records updated', async () => {
      await summaryLogMetrics.recordWasteRecordsUpdated(
        { processingType: PROCESSING_TYPES.EXPORTER },
        0
      )

      expect(mockPutDimensions).toHaveBeenCalledWith({
        operation: 'updated',
        processingType: 'exporter'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.wasteRecords',
        0,
        Unit.Count,
        StorageResolution.Standard
      )
    })

    it('does not record metric when metrics disabled', async () => {
      config.set('isMetricsEnabled', false)

      await summaryLogMetrics.recordWasteRecordsUpdated(
        { processingType: PROCESSING_TYPES.REPROCESSOR_INPUT },
        5
      )

      expect(mockPutMetric).not.toHaveBeenCalled()
      expect(mockPutDimensions).not.toHaveBeenCalled()
    })
  })

  describe('recordValidationDuration', () => {
    it('records duration with processingType dimension', async () => {
      await summaryLogMetrics.recordValidationDuration(
        { processingType: PROCESSING_TYPES.REPROCESSOR_INPUT },
        1500
      )

      expect(mockPutDimensions).toHaveBeenCalledWith({
        processingType: 'reprocessor_input'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.validation.duration',
        1500,
        Unit.Milliseconds,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })

    it('lowercases processingType for all values', async () => {
      await summaryLogMetrics.recordValidationDuration(
        { processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT },
        2000
      )

      expect(mockPutDimensions).toHaveBeenCalledWith({
        processingType: 'reprocessor_output'
      })
    })

    it('does not record metric when metrics disabled', async () => {
      config.set('isMetricsEnabled', false)

      await summaryLogMetrics.recordValidationDuration(
        { processingType: PROCESSING_TYPES.EXPORTER },
        1000
      )

      expect(mockPutMetric).not.toHaveBeenCalled()
      expect(mockPutDimensions).not.toHaveBeenCalled()
    })
  })

  describe('timedSubmission', () => {
    it('calls timed with metric name and processingType dimension', async () => {
      const fn = vi.fn().mockResolvedValue('result')

      await summaryLogMetrics.timedSubmission(
        { processingType: PROCESSING_TYPES.EXPORTER },
        fn
      )

      expect(mockTimed).toHaveBeenCalledWith(
        'summaryLog.submission.duration',
        { processingType: 'exporter' },
        fn
      )
    })

    it('lowercases processingType for all values', async () => {
      const fn = vi.fn().mockResolvedValue('result')

      await summaryLogMetrics.timedSubmission(
        { processingType: PROCESSING_TYPES.REPROCESSOR_INPUT },
        fn
      )

      expect(mockTimed).toHaveBeenCalledWith(
        'summaryLog.submission.duration',
        { processingType: 'reprocessor_input' },
        fn
      )
    })

    it('returns the result of the wrapped function', async () => {
      const expectedResult = { foo: 'bar' }
      const fn = vi.fn().mockResolvedValue(expectedResult)

      const result = await summaryLogMetrics.timedSubmission(
        { processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT },
        fn
      )

      expect(result).toEqual(expectedResult)
    })
  })

  describe('recordValidationIssues', () => {
    it('records metric with severity, category and processingType dimensions', async () => {
      await summaryLogMetrics.recordValidationIssues(
        {
          severity: VALIDATION_SEVERITY.ERROR,
          category: VALIDATION_CATEGORY.BUSINESS,
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        },
        3
      )

      expect(mockPutDimensions).toHaveBeenCalledWith({
        severity: 'error',
        category: 'business',
        processingType: 'reprocessor_input'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.validation.issues',
        3,
        Unit.Count,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })

    it('records metric with specified count', async () => {
      await summaryLogMetrics.recordValidationIssues(
        {
          severity: VALIDATION_SEVERITY.FATAL,
          category: VALIDATION_CATEGORY.TECHNICAL,
          processingType: PROCESSING_TYPES.EXPORTER
        },
        5
      )

      expect(mockPutDimensions).toHaveBeenCalledWith({
        severity: 'fatal',
        category: 'technical',
        processingType: 'exporter'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.validation.issues',
        5,
        Unit.Count,
        StorageResolution.Standard
      )
    })

    it('handles all severity values', async () => {
      const severities = [
        VALIDATION_SEVERITY.FATAL,
        VALIDATION_SEVERITY.ERROR,
        VALIDATION_SEVERITY.WARNING
      ]

      for (const severity of severities) {
        vi.clearAllMocks()
        await summaryLogMetrics.recordValidationIssues(
          {
            severity,
            category: VALIDATION_CATEGORY.TECHNICAL,
            processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
          },
          1
        )

        expect(mockPutDimensions).toHaveBeenCalledWith({
          severity,
          category: 'technical',
          processingType: 'reprocessor_output'
        })
      }
    })

    it('handles all category values', async () => {
      const categories = [
        VALIDATION_CATEGORY.TECHNICAL,
        VALIDATION_CATEGORY.BUSINESS
      ]

      for (const category of categories) {
        vi.clearAllMocks()
        await summaryLogMetrics.recordValidationIssues(
          {
            severity: VALIDATION_SEVERITY.ERROR,
            category,
            processingType: PROCESSING_TYPES.EXPORTER
          },
          1
        )

        expect(mockPutDimensions).toHaveBeenCalledWith({
          severity: 'error',
          category,
          processingType: 'exporter'
        })
      }
    })

    it('does not record metric when metrics disabled', async () => {
      config.set('isMetricsEnabled', false)

      await summaryLogMetrics.recordValidationIssues(
        {
          severity: VALIDATION_SEVERITY.ERROR,
          category: VALIDATION_CATEGORY.BUSINESS,
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        },
        1
      )

      expect(mockPutMetric).not.toHaveBeenCalled()
      expect(mockPutDimensions).not.toHaveBeenCalled()
      expect(mockFlush).not.toHaveBeenCalled()
    })
  })

  describe('recordRowOutcome', () => {
    it('records metric with outcome and processingType dimensions', async () => {
      await summaryLogMetrics.recordRowOutcome(
        {
          outcome: ROW_OUTCOME.INCLUDED,
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        },
        10
      )

      expect(mockPutDimensions).toHaveBeenCalledWith({
        outcome: 'included',
        processingType: 'reprocessor_input'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.rows.outcome',
        10,
        Unit.Count,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })

    it('records metric with specified count', async () => {
      await summaryLogMetrics.recordRowOutcome(
        {
          outcome: ROW_OUTCOME.REJECTED,
          processingType: PROCESSING_TYPES.EXPORTER
        },
        25
      )

      expect(mockPutDimensions).toHaveBeenCalledWith({
        outcome: 'rejected',
        processingType: 'exporter'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.rows.outcome',
        25,
        Unit.Count,
        StorageResolution.Standard
      )
    })

    it('lowercases outcome enum values', async () => {
      const outcomes = [
        { input: ROW_OUTCOME.INCLUDED, expected: 'included' },
        { input: ROW_OUTCOME.EXCLUDED, expected: 'excluded' },
        { input: ROW_OUTCOME.REJECTED, expected: 'rejected' }
      ]

      for (const { input, expected } of outcomes) {
        vi.clearAllMocks()
        await summaryLogMetrics.recordRowOutcome(
          {
            outcome: input,
            processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
          },
          1
        )

        expect(mockPutDimensions).toHaveBeenCalledWith({
          outcome: expected,
          processingType: 'reprocessor_output'
        })
      }
    })

    it('does not record metric when metrics disabled', async () => {
      config.set('isMetricsEnabled', false)

      await summaryLogMetrics.recordRowOutcome(
        {
          outcome: ROW_OUTCOME.INCLUDED,
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        },
        1
      )

      expect(mockPutMetric).not.toHaveBeenCalled()
      expect(mockPutDimensions).not.toHaveBeenCalled()
      expect(mockFlush).not.toHaveBeenCalled()
    })
  })
})
