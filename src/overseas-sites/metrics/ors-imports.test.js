import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Metrics } from '@defra/cdp-metrics'
import {
  ORS_FILE_RESULT_STATUS,
  ORS_IMPORT_STATUS
} from '#overseas-sites/domain/import-status.js'

const mockTimed = vi.fn(async (_name, _dimensions, fn) => fn())

vi.mock('#common/helpers/metrics.js', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    timed: (...args) => mockTimed(...args)
  }
})

const { orsImportMetrics } = await import('./ors-imports.js')

describe('orsImportMetrics', () => {
  let counterSpy

  beforeEach(() => {
    counterSpy = vi
      .spyOn(Metrics.prototype, 'counter')
      .mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  describe('recordStatusTransition', () => {
    it('records metric with status dimension', async () => {
      await orsImportMetrics.recordStatusTransition({
        status: ORS_IMPORT_STATUS.PROCESSING
      })

      expect(counterSpy).toHaveBeenCalledWith('orsImport.statusTransition', 1, {
        status: 'processing'
      })
    })

    it('records completed status', async () => {
      await orsImportMetrics.recordStatusTransition({
        status: ORS_IMPORT_STATUS.COMPLETED
      })

      expect(counterSpy).toHaveBeenCalledWith('orsImport.statusTransition', 1, {
        status: 'completed'
      })
    })

    it('records failed status', async () => {
      await orsImportMetrics.recordStatusTransition({
        status: ORS_IMPORT_STATUS.FAILED
      })

      expect(counterSpy).toHaveBeenCalledWith('orsImport.statusTransition', 1, {
        status: 'failed'
      })
    })
  })

  describe('recordSitesCreated', () => {
    it('records count of sites created', async () => {
      await orsImportMetrics.recordSitesCreated(5)

      expect(counterSpy).toHaveBeenCalledWith('orsImport.sitesCreated', 5, {})
    })

    it('records zero when no sites created', async () => {
      await orsImportMetrics.recordSitesCreated(0)

      expect(counterSpy).toHaveBeenCalledWith('orsImport.sitesCreated', 0, {})
    })
  })

  describe('recordFileResult', () => {
    it('records successful file result', async () => {
      await orsImportMetrics.recordFileResult({
        status: ORS_FILE_RESULT_STATUS.SUCCESS
      })

      expect(counterSpy).toHaveBeenCalledWith('orsImport.fileResult', 1, {
        status: 'success'
      })
    })

    it('records failed file result', async () => {
      await orsImportMetrics.recordFileResult({
        status: ORS_FILE_RESULT_STATUS.FAILURE
      })

      expect(counterSpy).toHaveBeenCalledWith('orsImport.fileResult', 1, {
        status: 'failure'
      })
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
