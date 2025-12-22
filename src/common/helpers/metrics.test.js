import { StorageResolution, Unit } from 'aws-embedded-metrics'

import { config } from '#root/config.js'
import { incrementCounter, recordDuration, timed } from './metrics.js'

const mockPutMetric = vi.fn()
const mockPutDimensions = vi.fn()
const mockFlush = vi.fn()
const mockLoggerError = vi.fn()

vi.mock('aws-embedded-metrics', async (importOriginal) => {
  const awsEmbeddedMetrics = await importOriginal()

  return {
    ...awsEmbeddedMetrics,
    createMetricsLogger: () => ({
      putMetric: mockPutMetric,
      putDimensions: mockPutDimensions,
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

      test('Should set dimensions when provided', async () => {
        const dimensions = { status: 'validated' }
        await incrementCounter(mockMetricsName, 1, dimensions)

        expect(mockPutDimensions).toHaveBeenCalledWith(dimensions)
      })

      test('Should not call putDimensions when dimensions not provided', async () => {
        await incrementCounter(mockMetricsName)

        expect(mockPutDimensions).not.toHaveBeenCalled()
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

      test('Should set dimensions when provided', async () => {
        const dimensions = { stage: 'validation' }
        await recordDuration(mockMetricsName, 100, dimensions)

        expect(mockPutDimensions).toHaveBeenCalledWith(dimensions)
      })

      test('Should not call putDimensions when dimensions not provided', async () => {
        await recordDuration(mockMetricsName, 100)

        expect(mockPutDimensions).not.toHaveBeenCalled()
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

  describe('#timed', () => {
    beforeEach(() => {
      config.set('isMetricsEnabled', true)
      vi.clearAllMocks()
    })

    test('Should return the result of the function', async () => {
      const expectedResult = { foo: 'bar' }
      const fn = vi.fn().mockResolvedValue(expectedResult)

      const result = await timed(mockMetricsName, fn)

      expect(result).toEqual(expectedResult)
    })

    test('Should record duration metric', async () => {
      const fn = vi.fn().mockResolvedValue('result')

      await timed(mockMetricsName, fn)

      expect(mockPutMetric).toHaveBeenCalledWith(
        mockMetricsName,
        expect.any(Number),
        Unit.Milliseconds,
        StorageResolution.Standard
      )
    })

    test('Should record duration even when function throws', async () => {
      const error = new Error('test error')
      const fn = vi.fn().mockRejectedValue(error)

      await expect(timed(mockMetricsName, fn)).rejects.toThrow('test error')

      expect(mockPutMetric).toHaveBeenCalledWith(
        mockMetricsName,
        expect.any(Number),
        Unit.Milliseconds,
        StorageResolution.Standard
      )
    })

    test('Should work with synchronous functions', async () => {
      const expectedResult = 'sync result'
      const fn = vi.fn().mockReturnValue(expectedResult)

      const result = await timed(mockMetricsName, fn)

      expect(result).toEqual(expectedResult)
      expect(mockPutMetric).toHaveBeenCalled()
    })

    test('Should set dimensions when provided', async () => {
      const dimensions = { stage: 'validation' }
      const fn = vi.fn().mockResolvedValue('result')

      await timed(mockMetricsName, fn, dimensions)

      expect(mockPutDimensions).toHaveBeenCalledWith(dimensions)
    })

    test('Should not call putDimensions when dimensions not provided', async () => {
      const fn = vi.fn().mockResolvedValue('result')

      await timed(mockMetricsName, fn)

      expect(mockPutDimensions).not.toHaveBeenCalled()
    })
  })
})
