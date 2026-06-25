import { describe, beforeEach, expect } from 'vitest'

import { STREAM_EVENT_KIND } from '../stream-schema.js'
import { buildStreamEvent, buildPrnCreatedEvent } from '../stream-test-data.js'

export const testFindLatestByPartitionAndKindBehaviour = (it) => {
  describe('findLatestByPartitionAndKind', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ streamRepository: import('../stream-port.js').WasteBalanceStreamRepositoryFactory }} */ {
          streamRepository
        }
      ) => {
        repository = await streamRepository()
      }
    )

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

    it('isolates results by partition', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-a',
          accreditationId: 'acc-a',
          number: 1,
          payload: { summaryLogId: 'log-a', creditTotal: 100 }
        })
      )
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-b',
          accreditationId: 'acc-b',
          number: 1,
          payload: { summaryLogId: 'log-b', creditTotal: 200 }
        })
      )

      const a = await repository.findLatestByPartitionAndKind(
        'reg-a',
        'acc-a',
        STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )
      const b = await repository.findLatestByPartitionAndKind(
        'reg-b',
        'acc-b',
        STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )

      expect(a.accreditationId).toBe('acc-a')
      expect(a.payload.summaryLogId).toBe('log-a')
      expect(b.accreditationId).toBe('acc-b')
      expect(b.payload.summaryLogId).toBe('log-b')
    })

    it('treats null and non-null accreditationId as separate streams', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-null',
          accreditationId: null,
          number: 1,
          payload: { summaryLogId: 'log-null', creditTotal: 10 },
          closingBalance: { amount: 10, availableAmount: 10 }
        })
      )
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-null',
          accreditationId: 'acc-present',
          number: 1,
          payload: { summaryLogId: 'log-present', creditTotal: 999 },
          closingBalance: { amount: 999, availableAmount: 999 }
        })
      )

      const nullResult = await repository.findLatestByPartitionAndKind(
        'reg-null',
        null,
        STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )
      const nonNullResult = await repository.findLatestByPartitionAndKind(
        'reg-null',
        'acc-present',
        STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )

      expect(nullResult.closingBalance).toEqual({
        amount: 10,
        availableAmount: 10
      })
      expect(nonNullResult.closingBalance).toEqual({
        amount: 999,
        availableAmount: 999
      })
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
