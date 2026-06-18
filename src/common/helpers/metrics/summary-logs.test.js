import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Metrics } from '@defra/cdp-metrics'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import {
  VALIDATION_SEVERITY,
  VALIDATION_CATEGORY
} from '#common/enums/validation.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

const mockTimed = vi.fn(async (_name, _dimensions, fn) => fn())

vi.mock('#common/helpers/metrics.js', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    timed: (...args) => mockTimed(...args)
  }
})

const { summaryLogMetrics } = await import('./summary-logs.js')

describe('summaryLogMetrics', () => {
  let counterSpy
  let millisSpy

  beforeEach(() => {
    counterSpy = vi
      .spyOn(Metrics.prototype, 'counter')
      .mockResolvedValue(undefined)
    millisSpy = vi
      .spyOn(Metrics.prototype, 'millis')
      .mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  describe('recordStatusTransition', () => {
    it('records metric with status and processingType dimensions', async () => {
      await summaryLogMetrics.recordStatusTransition({
        status: 'preprocessing',
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
      })

      expect(counterSpy).toHaveBeenCalledWith(
        'summaryLog.statusTransition',
        1,
        {
          status: 'preprocessing',
          processingType: 'reprocessor_input'
        }
      )
    })

    it('lowercases processingType enum values', async () => {
      await summaryLogMetrics.recordStatusTransition({
        status: 'validated',
        processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
      })

      expect(counterSpy).toHaveBeenCalledWith(
        'summaryLog.statusTransition',
        1,
        {
          status: 'validated',
          processingType: 'reprocessor_output'
        }
      )
    })

    it('handles exporter processingType', async () => {
      await summaryLogMetrics.recordStatusTransition({
        status: 'submitted',
        processingType: PROCESSING_TYPES.EXPORTER
      })

      expect(counterSpy).toHaveBeenCalledWith(
        'summaryLog.statusTransition',
        1,
        {
          status: 'submitted',
          processingType: 'exporter'
        }
      )
    })

    it('omits processingType dimension for early lifecycle states', async () => {
      await summaryLogMetrics.recordStatusTransition({ status: 'validating' })

      expect(counterSpy).toHaveBeenCalledWith(
        'summaryLog.statusTransition',
        1,
        {
          status: 'validating'
        }
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

        expect(counterSpy).toHaveBeenCalledWith(
          'summaryLog.statusTransition',
          1,
          {
            status,
            processingType: 'exporter'
          }
        )
      }
    })
  })

  describe('recordWasteRecordsCreated', () => {
    it('records metric with count, operation and processingType dimensions', async () => {
      await summaryLogMetrics.recordWasteRecordsCreated(
        { processingType: PROCESSING_TYPES.REPROCESSOR_INPUT },
        42
      )

      expect(counterSpy).toHaveBeenCalledWith('summaryLog.wasteRecords', 42, {
        operation: 'created',
        processingType: 'reprocessor_input'
      })
    })

    it('records zero when no records created', async () => {
      await summaryLogMetrics.recordWasteRecordsCreated(
        { processingType: PROCESSING_TYPES.EXPORTER },
        0
      )

      expect(counterSpy).toHaveBeenCalledWith('summaryLog.wasteRecords', 0, {
        operation: 'created',
        processingType: 'exporter'
      })
    })
  })

  describe('recordWasteRecordsUpdated', () => {
    it('records metric with count, operation and processingType dimensions', async () => {
      await summaryLogMetrics.recordWasteRecordsUpdated(
        { processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT },
        15
      )

      expect(counterSpy).toHaveBeenCalledWith('summaryLog.wasteRecords', 15, {
        operation: 'updated',
        processingType: 'reprocessor_output'
      })
    })

    it('records zero when no records updated', async () => {
      await summaryLogMetrics.recordWasteRecordsUpdated(
        { processingType: PROCESSING_TYPES.EXPORTER },
        0
      )

      expect(counterSpy).toHaveBeenCalledWith('summaryLog.wasteRecords', 0, {
        operation: 'updated',
        processingType: 'exporter'
      })
    })
  })

  describe('recordValidationDuration', () => {
    it('records duration with processingType dimension', async () => {
      await summaryLogMetrics.recordValidationDuration(
        { processingType: PROCESSING_TYPES.REPROCESSOR_INPUT },
        1500
      )

      expect(millisSpy).toHaveBeenCalledWith(
        'summaryLog.validation.duration',
        1500,
        {
          processingType: 'reprocessor_input'
        }
      )
    })

    it('lowercases processingType for all values', async () => {
      await summaryLogMetrics.recordValidationDuration(
        { processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT },
        2000
      )

      expect(millisSpy).toHaveBeenCalledWith(
        'summaryLog.validation.duration',
        2000,
        {
          processingType: 'reprocessor_output'
        }
      )
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

      expect(counterSpy).toHaveBeenCalledWith(
        'summaryLog.validation.issues',
        3,
        {
          severity: 'error',
          category: 'business',
          processingType: 'reprocessor_input'
        }
      )
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

      expect(counterSpy).toHaveBeenCalledWith(
        'summaryLog.validation.issues',
        5,
        {
          severity: 'fatal',
          category: 'technical',
          processingType: 'exporter'
        }
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

        expect(counterSpy).toHaveBeenCalledWith(
          'summaryLog.validation.issues',
          1,
          {
            severity,
            category: 'technical',
            processingType: 'reprocessor_output'
          }
        )
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

        expect(counterSpy).toHaveBeenCalledWith(
          'summaryLog.validation.issues',
          1,
          {
            severity: 'error',
            category,
            processingType: 'exporter'
          }
        )
      }
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

      expect(counterSpy).toHaveBeenCalledWith('summaryLog.rows.outcome', 10, {
        outcome: 'included',
        processingType: 'reprocessor_input'
      })
    })

    it('records metric with specified count', async () => {
      await summaryLogMetrics.recordRowOutcome(
        {
          outcome: ROW_OUTCOME.REJECTED,
          processingType: PROCESSING_TYPES.EXPORTER
        },
        25
      )

      expect(counterSpy).toHaveBeenCalledWith('summaryLog.rows.outcome', 25, {
        outcome: 'rejected',
        processingType: 'exporter'
      })
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

        expect(counterSpy).toHaveBeenCalledWith('summaryLog.rows.outcome', 1, {
          outcome: expected,
          processingType: 'reprocessor_output'
        })
      }
    })
  })
})
