import { StorageResolution, Unit } from 'aws-embedded-metrics'

import { config } from '#root/config.js'
import { incrementCounter, recordDuration } from './metrics.js'

const mockPutMetric = vi.fn()
const mockFlush = vi.fn()
const mockLoggerError = vi.fn()

vi.mock('aws-embedded-metrics', async (importOriginal) => {
  const awsEmbeddedMetrics = await importOriginal()

  return {
    ...awsEmbeddedMetrics,
    createMetricsLogger: () => ({
      putMetric: mockPutMetric,
      flush: mockFlush
    })
  }
})

vi.mock('./logging/logger.js', () => ({
  logger: {
    error: (...args) => mockLoggerError(...args)
  }
}))

const mockMetricsName = 'mock-metrics-name'

describe('#metrics', () => {
  describe('#incrementCounter', () => {
    describe('When metrics is not enabled', () => {
      beforeEach(async () => {
        config.set('isMetricsEnabled', false)
        await incrementCounter(mockMetricsName, 5)
      })

      test('Should not call metric', () => {
        expect(mockPutMetric).not.toHaveBeenCalled()
      })

      test('Should not call flush', () => {
        expect(mockFlush).not.toHaveBeenCalled()
      })
    })

    describe('When metrics is enabled', () => {
      beforeEach(() => {
        config.set('isMetricsEnabled', true)
      })

      test('Should send metric with default value of 1', async () => {
        await incrementCounter(mockMetricsName)

        expect(mockPutMetric).toHaveBeenCalledWith(
          mockMetricsName,
          1,
          Unit.Count,
          StorageResolution.Standard
        )
      })

      test('Should send metric with specified value', async () => {
        await incrementCounter(mockMetricsName, 42)

        expect(mockPutMetric).toHaveBeenCalledWith(
          mockMetricsName,
          42,
          Unit.Count,
          StorageResolution.Standard
        )
      })

      test('Should call flush', async () => {
        await incrementCounter(mockMetricsName)
        expect(mockFlush).toHaveBeenCalled()
      })
    })

    describe('When metrics throws', () => {
      const mockError = 'mock-metrics-put-error'

      beforeEach(async () => {
        config.set('isMetricsEnabled', true)
        mockFlush.mockRejectedValue(new Error(mockError))

        await incrementCounter(mockMetricsName)
      })

      test('Should log expected error', () => {
        expect(mockLoggerError).toHaveBeenCalledWith(
          Error(mockError),
          mockError
        )
      })
    })
  })

  describe('#recordDuration', () => {
    describe('When metrics is not enabled', () => {
      beforeEach(async () => {
        config.set('isMetricsEnabled', false)
        await recordDuration(mockMetricsName, 150)
      })

      test('Should not call metric', () => {
        expect(mockPutMetric).not.toHaveBeenCalled()
      })

      test('Should not call flush', () => {
        expect(mockFlush).not.toHaveBeenCalled()
      })
    })

    describe('When metrics is enabled', () => {
      beforeEach(() => {
        config.set('isMetricsEnabled', true)
      })

      test('Should send metric with duration in milliseconds', async () => {
        await recordDuration(mockMetricsName, 250)

        expect(mockPutMetric).toHaveBeenCalledWith(
          mockMetricsName,
          250,
          Unit.Milliseconds,
          StorageResolution.Standard
        )
      })

      test('Should call flush', async () => {
        await recordDuration(mockMetricsName, 100)
        expect(mockFlush).toHaveBeenCalled()
      })
    })

    describe('When metrics throws', () => {
      const mockError = 'mock-metrics-put-error'

      beforeEach(async () => {
        config.set('isMetricsEnabled', true)
        mockFlush.mockRejectedValue(new Error(mockError))

        await recordDuration(mockMetricsName, 500)
      })

      test('Should log expected error', () => {
        expect(mockLoggerError).toHaveBeenCalledWith(
          Error(mockError),
          mockError
        )
      })
    })
  })
})
