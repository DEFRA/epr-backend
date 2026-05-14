import { describe, beforeEach, expect } from 'vitest'

import { buildStreamEvent, buildPrnCreatedEvent } from '../stream-test-data.js'
import {
  StreamSlotConflictError,
  StreamIdempotencyConflictError
} from '../stream-port.js'

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
          number: 3
        })
      )

      await expect(
        repository.appendEvent(
          buildStreamEvent({
            registrationId: 'reg-slot-err',
            accreditationId: 'acc-slot-err',
            number: 3,
            payload: { summaryLogId: 'log-different', creditTotal: 200 }
          })
        )
      ).rejects.toMatchObject({
        registrationId: 'reg-slot-err',
        accreditationId: 'acc-slot-err',
        slotNumber: 3
      })
    })

    it('rejects duplicate summaryLogId within the same stream and kind (idempotency)', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-idem',
          accreditationId: 'acc-idem',
          number: 1,
          payload: { summaryLogId: 'log-dup', creditTotal: 100 }
        })
      )

      await expect(
        repository.appendEvent(
          buildStreamEvent({
            registrationId: 'reg-idem',
            accreditationId: 'acc-idem',
            number: 2,
            payload: { summaryLogId: 'log-dup', creditTotal: 100 }
          })
        )
      ).rejects.toBeInstanceOf(StreamIdempotencyConflictError)
    })

    it('rejects duplicate prnId within the same stream and kind (idempotency)', async () => {
      await repository.appendEvent(
        buildPrnCreatedEvent({
          registrationId: 'reg-prn-idem',
          accreditationId: 'acc-prn-idem',
          number: 1,
          payload: { prnId: 'prn-dup', amount: 50 }
        })
      )

      await expect(
        repository.appendEvent(
          buildPrnCreatedEvent({
            registrationId: 'reg-prn-idem',
            accreditationId: 'acc-prn-idem',
            number: 2,
            payload: { prnId: 'prn-dup', amount: 50 }
          })
        )
      ).rejects.toBeInstanceOf(StreamIdempotencyConflictError)
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

    it('allows the same summaryLogId across different partitions', async () => {
      await repository.appendEvent(
        buildStreamEvent({
          registrationId: 'reg-cross-a',
          accreditationId: 'acc-cross-a',
          number: 1,
          payload: { summaryLogId: 'log-shared', creditTotal: 100 }
        })
      )

      await expect(
        repository.appendEvent(
          buildStreamEvent({
            registrationId: 'reg-cross-b',
            accreditationId: 'acc-cross-b',
            number: 1,
            payload: { summaryLogId: 'log-shared', creditTotal: 200 }
          })
        )
      ).resolves.toBeDefined()
    })
  })
}
