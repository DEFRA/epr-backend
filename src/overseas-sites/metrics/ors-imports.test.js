import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StorageResolution, Unit } from 'aws-embedded-metrics'
import { config } from '#root/config.js'
import {
  ORS_FILE_RESULT_STATUS,
  ORS_IMPORT_STATUS
} from '#overseas-sites/domain/import-status.js'

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

const { orsImportMetrics } = await import('./ors-imports.js')

describe('orsImportMetrics', () => {
  beforeEach(() => {
    config.set('isMetricsEnabled', true)
    mockFlush.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('recordStatusTransition', () => {
    it('records metric with status dimension', async () => {
      await orsImportMetrics.recordStatusTransition({
        status: ORS_IMPORT_STATUS.PROCESSING
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        status: 'processing'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'orsImport.statusTransition',
        1,
        Unit.Count,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })

    it('records completed status', async () => {
      await orsImportMetrics.recordStatusTransition({
        status: ORS_IMPORT_STATUS.COMPLETED
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        status: 'completed'
      })
    })

    it('records failed status', async () => {
      await orsImportMetrics.recordStatusTransition({
        status: ORS_IMPORT_STATUS.FAILED
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        status: 'failed'
      })
    })

    it('does not record metric when metrics disabled', async () => {
      config.set('isMetricsEnabled', false)

      await orsImportMetrics.recordStatusTransition({
        status: ORS_IMPORT_STATUS.PROCESSING
      })

      expect(mockPutMetric).not.toHaveBeenCalled()
      expect(mockPutDimensions).not.toHaveBeenCalled()
      expect(mockFlush).not.toHaveBeenCalled()
    })

    it('logs error when flush fails', async () => {
      const mockError = new Error('flush failed')
      mockFlush.mockRejectedValue(mockError)

      await orsImportMetrics.recordStatusTransition({
        status: ORS_IMPORT_STATUS.PROCESSING
      })

      expect(mockLoggerError).toHaveBeenCalledWith(mockError, 'flush failed')
    })
  })

  describe('recordSitesCreated', () => {
    it('records count of sites created', async () => {
      await orsImportMetrics.recordSitesCreated(5)

      expect(mockPutDimensions).toHaveBeenCalledWith({})
      expect(mockPutMetric).toHaveBeenCalledWith(
        'orsImport.sitesCreated',
        5,
        Unit.Count,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })

    it('records zero when no sites created', async () => {
      await orsImportMetrics.recordSitesCreated(0)

      expect(mockPutMetric).toHaveBeenCalledWith(
        'orsImport.sitesCreated',
        0,
        Unit.Count,
        StorageResolution.Standard
      )
    })

    it('does not record metric when metrics disabled', async () => {
      config.set('isMetricsEnabled', false)

      await orsImportMetrics.recordSitesCreated(3)

      expect(mockPutMetric).not.toHaveBeenCalled()
      expect(mockPutDimensions).not.toHaveBeenCalled()
    })
  })

  describe('recordFileResult', () => {
    it('records successful file result', async () => {
      await orsImportMetrics.recordFileResult({
        status: ORS_FILE_RESULT_STATUS.SUCCESS
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        status: 'success'
      })
      expect(mockPutMetric).toHaveBeenCalledWith(
        'orsImport.fileResult',
        1,
        Unit.Count,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })

    it('records failed file result', async () => {
      await orsImportMetrics.recordFileResult({
        status: ORS_FILE_RESULT_STATUS.FAILURE
      })

      expect(mockPutDimensions).toHaveBeenCalledWith({
        status: 'failure'
      })
    })

    it('does not record metric when metrics disabled', async () => {
      config.set('isMetricsEnabled', false)

      await orsImportMetrics.recordFileResult({
        status: ORS_FILE_RESULT_STATUS.SUCCESS
      })

      expect(mockPutMetric).not.toHaveBeenCalled()
      expect(mockPutDimensions).not.toHaveBeenCalled()
      expect(mockFlush).not.toHaveBeenCalled()
    })
  })

  describe('timedImport', () => {
    it('calls timed with metric name and empty dimensions', async () => {
      const fn = vi.fn().mockResolvedValue('result')

      await orsImportMetrics.timedImport(fn)

      expect(mockTimed).toHaveBeenCalledWith('orsImport.duration', {}, fn)
    })

    it('returns the result of the wrapped function', async () => {
      const expectedResult = { foo: 'bar' }
      const fn = vi.fn().mockResolvedValue(expectedResult)

      const result = await orsImportMetrics.timedImport(fn)

      expect(result).toEqual(expectedResult)
    })
  })
})
