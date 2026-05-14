import { describe, beforeEach, expect } from 'vitest'

import { buildStreamEvent } from '../stream-test-data.js'
import { StreamSlotConflictError, StreamSequenceError } from '../stream-port.js'

export const testAppendEventBehaviour = (it) => {
  describe('appendEvent', () => {
    let repository

    beforeEach(async ({ streamRepository }) => {
      repository = await streamRepository()
    })

    it('persists an event and returns the stored event with an id', async () => {
      const event = buildStreamEvent({
        registrationId: 'reg-append',
        accreditationId: 'acc-append',
        number: 1
      })

      const stored = await repository.appendEvent(event)

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

    it('throws StreamSlotConflictError when a slot is already occupied', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-conflict',
          accreditationId: 'acc-conflict',
          number: 1
        })
      )

      await expect(
        repository.appendEvent(
          buildStreamEvent({
            registrationId: 'reg-conflict',
            accreditationId: 'acc-conflict',
            number: 1,
            payload: { summaryLogId: 'log-different', creditTotal: 200 }
          })
        )
      ).rejects.toBeInstanceOf(StreamSlotConflictError)
    })

    it('StreamSlotConflictError carries the partition identity and slot number', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-slot-err',
          accreditationId: 'acc-slot-err',
          number: 1
        })
      )

      await expect(
        repository.appendEvent(
          buildStreamEvent({
            registrationId: 'reg-slot-err',
            accreditationId: 'acc-slot-err',
            number: 1,
            payload: { summaryLogId: 'log-different', creditTotal: 200 }
          })
        )
      ).rejects.toMatchObject({
        registrationId: 'reg-slot-err',
        accreditationId: 'acc-slot-err',
        slotNumber: 1
      })
    })

    it('rejects the first event if its number is not 1', async () => {
      await expect(
        repository.appendEvent(
          buildStreamEvent({
            registrationId: 'reg-seq',
            accreditationId: 'acc-seq',
            number: 2
          })
        )
      ).rejects.toBeInstanceOf(StreamSequenceError)
    })

    it('rejects an event that skips a number', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-gap',
          accreditationId: 'acc-gap',
          number: 1
        })
      )

      await expect(
        repository.appendEvent(
          buildStreamEvent({
            registrationId: 'reg-gap',
            accreditationId: 'acc-gap',
            number: 3,
            payload: { summaryLogId: 'log-3', creditTotal: 300 }
          })
        )
      ).rejects.toBeInstanceOf(StreamSequenceError)
    })

    it('StreamSequenceError carries the provided and expected numbers', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-seq-err',
          accreditationId: 'acc-seq-err',
          number: 1
        })
      )

      await expect(
        repository.appendEvent(
          buildStreamEvent({
            registrationId: 'reg-seq-err',
            accreditationId: 'acc-seq-err',
            number: 5,
            payload: { summaryLogId: 'log-5', creditTotal: 500 }
          })
        )
      ).rejects.toMatchObject({
        registrationId: 'reg-seq-err',
        accreditationId: 'acc-seq-err',
        providedNumber: 5,
        expectedNumber: 2
      })
    })

    it('allows the same slot number across different partitions', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-a',
          accreditationId: 'acc-a',
          number: 1
        })
      )

      await expect(
        repository.appendEvent(
          buildStreamEvent({
            registrationId: 'reg-b',
            accreditationId: 'acc-b',
            number: 1
          })
        )
      ).resolves.toBeDefined()
    })
  })
}
