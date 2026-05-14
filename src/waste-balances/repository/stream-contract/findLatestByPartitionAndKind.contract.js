import { describe, beforeEach, expect } from 'vitest'

import { STREAM_EVENT_KIND } from '../stream-schema.js'
import {
  buildStreamEvent,
  buildPrnCreatedEvent
} from '../stream-test-data.js'

export const testFindLatestByPartitionAndKindBehaviour = (it) => {
  describe('findLatestByPartitionAndKind', () => {
    let repository

    beforeEach(async ({ streamRepository }) => {
      repository = await streamRepository()
    })

    it('returns null when no events of the given kind exist', async () => {
      await repository.appendEvent(
        buildPrnCreatedEvent({
          registrationId: 'reg-kind',
          accreditationId: 'acc-kind',
          number: 1
        })
      )

      const result = await repository.findLatestByPartitionAndKind(
        'reg-kind',
        'acc-kind',
        STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )

      expect(result).toBeNull()
    })

    it('returns the highest-numbered event of the specified kind', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-filter',
          accreditationId: 'acc-filter',
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 100 }
        })
      )
      await repository.appendEvent(
        buildPrnCreatedEvent({
          registrationId: 'reg-filter',
          accreditationId: 'acc-filter',
          number: 2,
          payload: { prnId: 'prn-1', amount: 50 }
        })
      )
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-filter',
          accreditationId: 'acc-filter',
          number: 3,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      )

      const result = await repository.findLatestByPartitionAndKind(
        'reg-filter',
        'acc-filter',
        STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )

      expect(result.number).toBe(3)
      expect(result.payload.summaryLogId).toBe('log-2')
    })

    it('returns null when the partition is empty', async () => {
      const result = await repository.findLatestByPartitionAndKind(
        'reg-empty',
        'acc-empty',
        STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )

      expect(result).toBeNull()
    })
  })
}
