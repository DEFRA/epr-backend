import { Metrics } from '@defra/cdp-metrics'

import { incrementCounter, recordDuration, timed } from './metrics.js'

const mockMetricsName = 'mock-metrics-name'

describe('#metrics', () => {
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
  })

  describe('#incrementCounter', () => {
    test('Should send counter with default value of 1', async () => {
      await incrementCounter(mockMetricsName, {})

      expect(counterSpy).toHaveBeenCalledWith(mockMetricsName, 1, {})
    })

    test('Should send counter with specified value and dimensions', async () => {
      const dimensions = { operation: 'test' }

      await incrementCounter(mockMetricsName, dimensions, 42)

      expect(counterSpy).toHaveBeenCalledWith(mockMetricsName, 42, dimensions)
    })
  })

  describe('#recordDuration', () => {
    test('Should send duration in milliseconds with dimensions', async () => {
      const dimensions = { stage: 'validation' }

      await recordDuration(mockMetricsName, dimensions, 250)

      expect(millisSpy).toHaveBeenCalledWith(mockMetricsName, 250, dimensions)
    })
  })

  describe('#timed', () => {
    test('Should return the result of the function', async () => {
      const expectedResult = { foo: 'bar' }
      const fn = vi.fn().mockResolvedValue(expectedResult)

      const result = await timed(mockMetricsName, {}, fn)

      expect(result).toEqual(expectedResult)
    })

    test('Should record duration metric', async () => {
      const fn = vi.fn().mockResolvedValue('result')

      await timed(mockMetricsName, {}, fn)

      expect(millisSpy).toHaveBeenCalledWith(
        mockMetricsName,
        expect.any(Number),
        {}
      )
    })

    test('Should re-throw and still record duration when function throws', async () => {
      const error = new Error('test error')
      const fn = vi.fn().mockRejectedValue(error)

      await expect(timed(mockMetricsName, {}, fn)).rejects.toThrow('test error')

      expect(millisSpy).toHaveBeenCalledWith(
        mockMetricsName,
        expect.any(Number),
        {}
      )
    })

    test('Should work with synchronous functions', async () => {
      const expectedResult = 'sync result'
      const fn = vi.fn().mockReturnValue(expectedResult)

      const result = await timed(mockMetricsName, {}, fn)

      expect(result).toEqual(expectedResult)
      expect(millisSpy).toHaveBeenCalled()
    })

    test('Should pass dimensions through to the duration metric', async () => {
      const dimensions = { stage: 'validation' }
      const fn = vi.fn().mockResolvedValue('result')

      await timed(mockMetricsName, dimensions, fn)

      expect(millisSpy).toHaveBeenCalledWith(
        mockMetricsName,
        expect.any(Number),
        dimensions
      )
    })
  })
})
