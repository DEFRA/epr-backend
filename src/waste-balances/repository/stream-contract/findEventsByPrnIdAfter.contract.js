import { describe, beforeEach, expect } from 'vitest'

import { STREAM_EVENT_KIND } from '../stream-schema.js'
import {
  buildPrnCreatedEvent,
  buildPrnCancelledAfterIssueEvent
} from '../stream-test-data.js'

export const testFindEventsByPrnIdAfterBehaviour = (it) => {
  describe('findEventsByPrnIdAfter', () => {
    let repository

    beforeEach(async ({ streamRepository }) => {
      repository = await streamRepository()
    })

    it('returns events with number greater than the watermark', async () => {
      await repository.appendEvent(
        buildPrnCreatedEvent({
          registrationId: 'reg-prn',
          accreditationId: 'acc-prn',
          number: 1,
          payload: { prnId: 'prn-watermark', amount: 50 }
        })
      )
      await repository.appendEvent(
        buildPrnCancelledAfterIssueEvent({
          registrationId: 'reg-prn',
          accreditationId: 'acc-prn',
          number: 3,
          payload: { prnId: 'prn-watermark', amount: 50 }
        })
      )

      const result = await repository.findEventsByPrnIdAfter(
        'prn-watermark',
        0
      )

      expect(result).toHaveLength(2)
      expect(result[0].number).toBe(1)
      expect(result[0].kind).toBe(STREAM_EVENT_KIND.PRN_CREATED)
      expect(result[1].number).toBe(3)
      expect(result[1].kind).toBe(STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE)
    })

    it('filters out events at or below the watermark', async () => {
      await repository.appendEvent(
        buildPrnCreatedEvent({
          registrationId: 'reg-wm',
          accreditationId: 'acc-wm',
          number: 1,
          payload: { prnId: 'prn-filter', amount: 50 }
        })
      )
      await repository.appendEvent(
        buildPrnCancelledAfterIssueEvent({
          registrationId: 'reg-wm',
          accreditationId: 'acc-wm',
          number: 5,
          payload: { prnId: 'prn-filter', amount: 50 }
        })
      )

      const result = await repository.findEventsByPrnIdAfter('prn-filter', 1)

      expect(result).toHaveLength(1)
      expect(result[0].number).toBe(5)
    })

    it('returns an empty array when no events exist after watermark', async () => {
      await repository.appendEvent(
        buildPrnCreatedEvent({
          registrationId: 'reg-caught-up',
          accreditationId: 'acc-caught-up',
          number: 1,
          payload: { prnId: 'prn-caught-up', amount: 50 }
        })
      )

      const result = await repository.findEventsByPrnIdAfter(
        'prn-caught-up',
        1
      )

      expect(result).toEqual([])
    })

    it('returns an empty array when no events exist for the prnId', async () => {
      const result = await repository.findEventsByPrnIdAfter(
        'prn-nonexistent',
        0
      )

      expect(result).toEqual([])
    })
  })
}
