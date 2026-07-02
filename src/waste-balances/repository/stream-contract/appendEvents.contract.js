import { describe, beforeEach, expect } from 'vitest'

import { buildStreamEvent } from '../stream-test-data.js'
import { StreamSequenceError, StreamSlotConflictError } from '../stream-port.js'

export const testAppendEventsBehaviour = (it) => {
  describe('appendEvents', () => {
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

    it('persists an event and returns the stored event with an id', async () => {
      const event = buildStreamEvent({
        registrationId: 'reg-append',
        accreditationId: 'acc-append',
        number: 1
      })

      const [stored] = await repository.appendEvents([event])

      expect(stored.id).toEqual(expect.any(String))
      expect(stored.id).not.toBe('')
      expect(stored.registrationId).toBe('reg-append')
      expect(stored.accreditationId).toBe('acc-append')
      expect(stored.number).toBe(1)
      expect(stored.kind).toBe(event.kind)
      expect(stored.payload).toEqual(event.payload)
      expect(stored.openingBalance).toEqual(event.openingBalance)
      expect(stored.closingBalance).toEqual(event.closingBalance)
    })

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

      const stored = await repository.appendEvents(events)

      expect(stored).toHaveLength(2)
      expect(stored[0].id).toEqual(expect.any(String))
      expect(stored[0].number).toBe(1)
      expect(stored[1].id).toEqual(expect.any(String))
      expect(stored[1].number).toBe(2)
    })

    it('throws StreamSequenceError when first event does not start at currentMax + 1', async () => {
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-seq',
          accreditationId: 'acc-seq',
          number: 1
        })
      ])

      const events = [
        buildStreamEvent({
          registrationId: 'reg-seq',
          accreditationId: 'acc-seq',
          number: 5,
          payload: { summaryLogId: 'log-5', creditTotal: 500 }
        })
      ]

      await expect(repository.appendEvents(events)).rejects.toBeInstanceOf(
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

      await expect(repository.appendEvents(events)).rejects.toBeInstanceOf(
        StreamSequenceError
      )
    })

    it('StreamSequenceError carries the provided and expected numbers', async () => {
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-seq-err',
          accreditationId: 'acc-seq-err',
          number: 1
        })
      ])

      await expect(
        repository.appendEvents([
          buildStreamEvent({
            registrationId: 'reg-seq-err',
            accreditationId: 'acc-seq-err',
            number: 5,
            payload: { summaryLogId: 'log-5', creditTotal: 500 }
          })
        ])
      ).rejects.toMatchObject({
        registrationId: 'reg-seq-err',
        accreditationId: 'acc-seq-err',
        providedNumber: 5,
        expectedNumber: 2
      })
    })

    it('throws StreamSlotConflictError when the starting slot is already occupied', async () => {
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-occupied',
          accreditationId: 'acc-occupied',
          number: 1
        })
      ])

      const events = [
        buildStreamEvent({
          registrationId: 'reg-occupied',
          accreditationId: 'acc-occupied',
          number: 1,
          payload: { summaryLogId: 'log-clash', creditTotal: 100 }
        })
      ]

      await expect(repository.appendEvents(events)).rejects.toBeInstanceOf(
        StreamSlotConflictError
      )
    })

    it('StreamSlotConflictError carries the partition identity and slot number', async () => {
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-slot-err',
          accreditationId: 'acc-slot-err',
          number: 1
        })
      ])

      await expect(
        repository.appendEvents([
          buildStreamEvent({
            registrationId: 'reg-slot-err',
            accreditationId: 'acc-slot-err',
            number: 1,
            payload: { summaryLogId: 'log-different', creditTotal: 200 }
          })
        ])
      ).rejects.toMatchObject({
        registrationId: 'reg-slot-err',
        accreditationId: 'acc-slot-err',
        slotNumber: 1
      })
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

      await expect(repository.appendEvents(events)).rejects.toBeInstanceOf(
        StreamSequenceError
      )
    })

    it('allows the same slot number across different partitions', async () => {
      await repository.appendEvents([
        buildStreamEvent({
          registrationId: 'reg-a',
          accreditationId: 'acc-a',
          number: 1
        })
      ])

      await expect(
        repository.appendEvents([
          buildStreamEvent({
            registrationId: 'reg-b',
            accreditationId: 'acc-b',
            number: 1
          })
        ])
      ).resolves.toBeDefined()
    })

    it('is a no-op for an empty array', async () => {
      const stored = await repository.appendEvents([])

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

      await repository.appendEvents(events)

      const latest = await repository.findLatestByPartition(
        'reg-vis',
        'acc-vis'
      )
      expect(latest).not.toBeNull()
      expect(latest.number).toBe(2)
    })
  })
}
