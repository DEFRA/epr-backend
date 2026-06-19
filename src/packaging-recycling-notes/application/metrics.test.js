import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Metrics } from '@defra/cdp-metrics'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

const { prnMetrics } = await import('./metrics.js')

describe('prnMetrics', () => {
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
    it('records metric with fromStatus and toStatus dimensions', async () => {
      await prnMetrics.recordStatusTransition({
        fromStatus: PRN_STATUS.DRAFT,
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION
      })

      expect(counterSpy).toHaveBeenCalledWith('prn.statusTransition', 1, {
        fromStatus: 'draft',
        toStatus: 'awaiting_authorisation'
      })
    })

    it('records metric with all optional dimensions when provided', async () => {
      await prnMetrics.recordStatusTransition({
        fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        toStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        material: 'paper',
        isExport: false
      })

      expect(counterSpy).toHaveBeenCalledWith('prn.statusTransition', 1, {
        fromStatus: 'awaiting_authorisation',
        toStatus: 'awaiting_acceptance',
        material: 'paper',
        isExport: 'false'
      })
    })

    it('records metric with export flag as string dimension', async () => {
      await prnMetrics.recordStatusTransition({
        fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        toStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        isExport: true
      })

      expect(counterSpy).toHaveBeenCalledWith('prn.statusTransition', 1, {
        fromStatus: 'awaiting_authorisation',
        toStatus: 'awaiting_acceptance',
        isExport: 'true'
      })
    })

    it('omits optional dimensions when not provided', async () => {
      await prnMetrics.recordStatusTransition({
        fromStatus: PRN_STATUS.DRAFT,
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION
      })

      expect(counterSpy).toHaveBeenCalledWith('prn.statusTransition', 1, {
        fromStatus: 'draft',
        toStatus: 'awaiting_authorisation'
      })
    })

    it('records metric with correct dimensions for all valid status transitions', async () => {
      const transitions = [
        {
          from: PRN_STATUS.DRAFT,
          to: PRN_STATUS.AWAITING_AUTHORISATION
        },
        {
          from: PRN_STATUS.DRAFT,
          to: PRN_STATUS.CANCELLED
        },
        {
          from: PRN_STATUS.AWAITING_AUTHORISATION,
          to: PRN_STATUS.AWAITING_ACCEPTANCE
        },
        {
          from: PRN_STATUS.AWAITING_AUTHORISATION,
          to: PRN_STATUS.CANCELLED
        }
      ]

      for (const { from, to } of transitions) {
        vi.clearAllMocks()
        await prnMetrics.recordStatusTransition({
          fromStatus: from,
          toStatus: to
        })

        expect(counterSpy).toHaveBeenCalledWith('prn.statusTransition', 1, {
          fromStatus: from,
          toStatus: to
        })
      }
    })
  })
})
