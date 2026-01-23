import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { config } from '#root/config.js'
import { organisationLinkingMetrics } from './organisation-linking.js'
import { StorageResolution, Unit } from 'aws-embedded-metrics'

const mockPutMetric = vi.fn()
const mockPutDimensions = vi.fn()
const mockFlush = vi.fn()

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

describe('organisationLinkingMetrics', () => {
  beforeEach(() => {
    config.set('isMetricsEnabled', true)
    mockFlush.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('organisationLinked', () => {
    it('records metric with no dimensions', async () => {
      await organisationLinkingMetrics.organisationLinked()

      expect(mockPutDimensions).toHaveBeenCalledWith({})
      expect(mockPutMetric).toHaveBeenCalledWith(
        'organisation.linked',
        1,
        Unit.Count,
        StorageResolution.Standard
      )
      expect(mockFlush).toHaveBeenCalled()
    })
  })
})
