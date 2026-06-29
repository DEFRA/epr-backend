import { describe, beforeEach, expect } from 'vitest'

import { buildStreamEvent } from '../stream-test-data.js'
import { StreamSequenceError, StreamSlotConflictError } from '../stream-port.js'

export const testBulkAppendEventsBehaviour = (it) => {
  describe('bulkAppendEvents', () => {
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

    it('inserts multiple events and returns stored events with ids', async () => {
      const events = [
        buildStreamEvent({
          registrationId: 'reg-bulk',
          accreditationId: 'acc-bulk',
          number: 1
        }),
        buildStreamEvent({
          registrationId: 'reg-bulk',
          accreditationId: 'acc-bulk',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      ]

      const stored = await repository.bulkAppendEvents(events)

      expect(stored).toHaveLength(2)
      expect(stored[0].id).toEqual(expect.any(String))
      expect(stored[0].number).toBe(1)
      expect(stored[1].id).toEqual(expect.any(String))
      expect(stored[1].number).toBe(2)
    })

    it('throws StreamSequenceError when first event does not start at currentMax + 1', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-seq',
          accreditationId: 'acc-seq',
          number: 1
        })
      )

      const events = [
        buildStreamEvent({
          registrationId: 'reg-seq',
          accreditationId: 'acc-seq',
          number: 5,
          payload: { summaryLogId: 'log-5', creditTotal: 500 }
        })
      ]

      await expect(repository.bulkAppendEvents(events)).rejects.toBeInstanceOf(
        StreamSequenceError
      )
    })

    it('throws StreamSequenceError when the first event of an empty partition is not number 1', async () => {
      const events = [
        buildStreamEvent({
          registrationId: 'reg-empty',
          accreditationId: 'acc-empty',
          number: 2
        })
      ]

      await expect(repository.bulkAppendEvents(events)).rejects.toBeInstanceOf(
        StreamSequenceError
      )
    })

    it('throws StreamSlotConflictError when the starting slot is already occupied', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-occupied',
          accreditationId: 'acc-occupied',
          number: 1
        })
      )

      const events = [
        buildStreamEvent({
          registrationId: 'reg-occupied',
          accreditationId: 'acc-occupied',
          number: 1,
          payload: { summaryLogId: 'log-clash', creditTotal: 100 }
        })
      ]

      await expect(repository.bulkAppendEvents(events)).rejects.toBeInstanceOf(
        StreamSlotConflictError
      )
    })

    it('throws StreamSequenceError when events are not sequentially numbered', async () => {
      const events = [
        buildStreamEvent({
          registrationId: 'reg-gap',
          accreditationId: 'acc-gap',
          number: 1
        }),
        buildStreamEvent({
          registrationId: 'reg-gap',
          accreditationId: 'acc-gap',
          number: 3,
          payload: { summaryLogId: 'log-3', creditTotal: 300 }
        })
      ]

      await expect(repository.bulkAppendEvents(events)).rejects.toBeInstanceOf(
        StreamSequenceError
      )
    })

    it('is a no-op for an empty array', async () => {
      const stored = await repository.bulkAppendEvents([])

      expect(stored).toEqual([])
    })

    it('appended events are visible via findLatestByPartition', async () => {
      const events = [
        buildStreamEvent({
          registrationId: 'reg-vis',
          accreditationId: 'acc-vis',
          number: 1
        }),
        buildStreamEvent({
          registrationId: 'reg-vis',
          accreditationId: 'acc-vis',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      ]

      await repository.bulkAppendEvents(events)

      const latest = await repository.findLatestByPartition(
        'reg-vis',
        'acc-vis'
      )
      expect(latest).not.toBeNull()
      expect(latest.number).toBe(2)
    })
  })
}
