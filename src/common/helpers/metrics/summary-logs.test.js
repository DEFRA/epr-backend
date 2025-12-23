import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StorageResolution, Unit } from 'aws-embedded-metrics'
import { config } from '#root/config.js'

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
    it('records metric with status dimension for preprocessing', async () => {
      await summaryLogMetrics.recordStatusTransition('preprocessing')

      expect(mockPutDimensions).toHaveBeenCalledWith({
        status: 'preprocessing'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.statusTransition',
        1,
        Unit.Count,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })

    it('records metric with status dimension for validated', async () => {
      await summaryLogMetrics.recordStatusTransition('validated')

      expect(mockPutDimensions).toHaveBeenCalledWith({ status: 'validated' })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.statusTransition',
        1,
        Unit.Count,
        StorageResolution.Standard
      )
    })

    it('records metric with status dimension for submitted', async () => {
      await summaryLogMetrics.recordStatusTransition('submitted')

      expect(mockPutDimensions).toHaveBeenCalledWith({ status: 'submitted' })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.statusTransition',
        1,
        Unit.Count,
        StorageResolution.Standard
      )
    })

    it('records metric with correct dimension for all valid statuses', async () => {
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

        expect(mockPutDimensions).toHaveBeenCalledWith({ status })
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

      await summaryLogMetrics.recordStatusTransition('validated')

      expect(mockPutMetric).not.toHaveBeenCalled()
      expect(mockPutDimensions).not.toHaveBeenCalled()
      expect(mockFlush).not.toHaveBeenCalled()
    })

    it('logs error when flush fails', async () => {
      const mockError = new Error('flush failed')
      mockFlush.mockRejectedValue(mockError)

      await summaryLogMetrics.recordStatusTransition('validated')

      expect(mockLoggerError).toHaveBeenCalledWith(mockError, 'flush failed')
    })
  })

  describe('recordWasteRecordsCreated', () => {
    it('records metric with count and operation dimension', async () => {
      await summaryLogMetrics.recordWasteRecordsCreated(42)

      expect(mockPutDimensions).toHaveBeenCalledWith({ operation: 'created' })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.wasteRecords',
        42,
        Unit.Count,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })

    it('records zero when no records created', async () => {
      await summaryLogMetrics.recordWasteRecordsCreated(0)

      expect(mockPutDimensions).toHaveBeenCalledWith({ operation: 'created' })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.wasteRecords',
        0,
        Unit.Count,
        StorageResolution.Standard
      )
    })

    it('does not record metric when metrics disabled', async () => {
      config.set('isMetricsEnabled', false)

      await summaryLogMetrics.recordWasteRecordsCreated(10)

      expect(mockPutMetric).not.toHaveBeenCalled()
      expect(mockPutDimensions).not.toHaveBeenCalled()
    })
  })

  describe('recordWasteRecordsUpdated', () => {
    it('records metric with count and operation dimension', async () => {
      await summaryLogMetrics.recordWasteRecordsUpdated(15)

      expect(mockPutDimensions).toHaveBeenCalledWith({ operation: 'updated' })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.wasteRecords',
        15,
        Unit.Count,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })

    it('records zero when no records updated', async () => {
      await summaryLogMetrics.recordWasteRecordsUpdated(0)

      expect(mockPutDimensions).toHaveBeenCalledWith({ operation: 'updated' })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'summaryLog.wasteRecords',
        0,
        Unit.Count,
        StorageResolution.Standard
      )
    })

    it('does not record metric when metrics disabled', async () => {
      config.set('isMetricsEnabled', false)

      await summaryLogMetrics.recordWasteRecordsUpdated(5)

      expect(mockPutMetric).not.toHaveBeenCalled()
      expect(mockPutDimensions).not.toHaveBeenCalled()
    })
  })

  describe('timedValidation', () => {
    it('calls timed with the correct metric name', async () => {
      const fn = vi.fn().mockResolvedValue('result')

      await summaryLogMetrics.timedValidation(fn)

      expect(mockTimed).toHaveBeenCalledWith(
        'summaryLog.validation.duration',
        {},
        fn
      )
    })

    it('returns the result of the wrapped function', async () => {
      const expectedResult = { foo: 'bar' }
      const fn = vi.fn().mockResolvedValue(expectedResult)

      const result = await summaryLogMetrics.timedValidation(fn)

      expect(result).toEqual(expectedResult)
    })
  })

  describe('timedSubmission', () => {
    it('calls timed with the correct metric name', async () => {
      const fn = vi.fn().mockResolvedValue('result')

      await summaryLogMetrics.timedSubmission(fn)

      expect(mockTimed).toHaveBeenCalledWith(
        'summaryLog.submission.duration',
        {},
        fn
      )
    })

    it('returns the result of the wrapped function', async () => {
      const expectedResult = { foo: 'bar' }
      const fn = vi.fn().mockResolvedValue(expectedResult)

      const result = await summaryLogMetrics.timedSubmission(fn)

      expect(result).toEqual(expectedResult)
    })
  })
})
