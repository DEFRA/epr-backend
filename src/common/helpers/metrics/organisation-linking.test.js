import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Metrics } from '@defra/cdp-metrics'
import {
  organisationLinkingMetrics,
  organisationUnlinkingMetrics
} from './organisation-linking.js'

describe('organisationLinkingMetrics', () => {
  let counterSpy

  beforeEach(() => {
    counterSpy = vi
      .spyOn(Metrics.prototype, 'counter')
      .mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('organisationLinked', () => {
    it('records metric with no dimensions', async () => {
      await organisationLinkingMetrics.organisationLinked()

      expect(counterSpy).toHaveBeenCalledWith('organisation.linked', 1, {})
    })
  })

  describe('organisationUnlinked', () => {
    it('records metric with no dimensions', async () => {
      await organisationUnlinkingMetrics.organisationUnlinked()

      expect(counterSpy).toHaveBeenCalledWith('organisation.unlinked', 1, {})
    })
  })
})
