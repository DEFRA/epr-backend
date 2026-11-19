import { describe, beforeEach, expect } from 'vitest'

import { anotherOrganisationNumber } from '#waste-records/repository/test-data.js'

import { buildLedgerEvent, buildLedgerId } from '../ledger-test-data.js'
import { LedgerSequenceError, LedgerSlotConflictError } from '../ledger-port.js'

export const testAppendEventsBehaviour = (it) => {
  describe('appendEvents', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ ledgerRepository: import('../ledger-port.js').WasteBalanceLedgerRepositoryFactory }} */ {
          ledgerRepository
        }
      ) => {
        repository = await ledgerRepository()
      }
    )

    it('persists an event and returns it as written', async () => {
      const event = buildLedgerEvent({
        registrationNumber: 'REG-reg-append',
        accreditationNumber: 'ACC-acc-append',
        number: 1
      })

      const [stored] = await repository.appendEvents([event])

      expect(stored).not.toHaveProperty('id')
      expect(stored.registrationNumber).toBe('REG-reg-append')
      expect(stored.accreditationNumber).toBe('ACC-acc-append')
      expect(stored.number).toBe(1)
      expect(stored.kind).toBe(event.kind)
      expect(stored.payload).toEqual(event.payload)
      expect(stored.openingBalance).toEqual(event.openingBalance)
      expect(stored.closingBalance).toEqual(event.closingBalance)
    })

    it('inserts multiple events and returns them in order', async () => {
      const events = [
        buildLedgerEvent({
          registrationNumber: 'REG-reg-bulk',
          accreditationNumber: 'ACC-acc-bulk',
          number: 1
        }),
        buildLedgerEvent({
          registrationNumber: 'REG-reg-bulk',
          accreditationNumber: 'ACC-acc-bulk',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      ]

      const stored = await repository.appendEvents(events)

      expect(stored).toHaveLength(2)
      expect(stored[0].number).toBe(1)
      expect(stored[1].number).toBe(2)
    })

    it('throws LedgerSequenceError when first event does not start at currentMax + 1', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-seq',
          accreditationNumber: 'ACC-acc-seq',
          number: 1
        })
      ])

      const events = [
        buildLedgerEvent({
          registrationNumber: 'REG-reg-seq',
          accreditationNumber: 'ACC-acc-seq',
          number: 5,
          payload: { summaryLogId: 'log-5', creditTotal: 500 }
        })
      ]

      await expect(repository.appendEvents(events)).rejects.toBeInstanceOf(
        LedgerSequenceError
      )
    })

    it('throws LedgerSequenceError when the first event of an empty ledger is not number 1', async () => {
      const events = [
        buildLedgerEvent({
          registrationNumber: 'REG-reg-empty',
          accreditationNumber: 'ACC-acc-empty',
          number: 2
        })
      ]

      await expect(repository.appendEvents(events)).rejects.toBeInstanceOf(
        LedgerSequenceError
      )
    })

    it('LedgerSequenceError carries the full ledger identity and both numbers', async () => {
      const ledger = {
        organisationNumber: anotherOrganisationNumber(),
        registrationNumber: 'REG-reg-seq-err',
        accreditationNumber: 'ACC-acc-seq-err'
      }
      await repository.appendEvents([
        buildLedgerEvent({ ...ledger, number: 1 })
      ])

      await expect(
        repository.appendEvents([
          buildLedgerEvent({
            ...ledger,
            number: 5,
            payload: { summaryLogId: 'log-5', creditTotal: 500 }
          })
        ])
      ).rejects.toMatchObject({
        ...ledger,
        providedNumber: 5,
        expectedNumber: 2
      })
    })

    it('throws LedgerSlotConflictError when the starting slot is already occupied', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-occupied',
          accreditationNumber: 'ACC-acc-occupied',
          number: 1
        })
      ])

      const events = [
        buildLedgerEvent({
          registrationNumber: 'REG-reg-occupied',
          accreditationNumber: 'ACC-acc-occupied',
          number: 1,
          payload: { summaryLogId: 'log-clash', creditTotal: 100 }
        })
      ]

      await expect(repository.appendEvents(events)).rejects.toBeInstanceOf(
        LedgerSlotConflictError
      )
    })

    it('LedgerSlotConflictError carries the full ledger identity and slot number', async () => {
      const ledger = {
        organisationNumber: anotherOrganisationNumber(),
        registrationNumber: 'REG-reg-slot-err',
        accreditationNumber: 'ACC-acc-slot-err'
      }
      await repository.appendEvents([
        buildLedgerEvent({ ...ledger, number: 1 })
      ])

      await expect(
        repository.appendEvents([
          buildLedgerEvent({
            ...ledger,
            number: 1,
            payload: { summaryLogId: 'log-different', creditTotal: 200 }
          })
        ])
      ).rejects.toMatchObject({
        ...ledger,
        slotNumber: 1
      })
    })

    it('throws LedgerSequenceError when events are not sequentially numbered', async () => {
      const events = [
        buildLedgerEvent({
          registrationNumber: 'REG-reg-gap',
          accreditationNumber: 'ACC-acc-gap',
          number: 1
        }),
        buildLedgerEvent({
          registrationNumber: 'REG-reg-gap',
          accreditationNumber: 'ACC-acc-gap',
          number: 3,
          payload: { summaryLogId: 'log-3', creditTotal: 300 }
        })
      ]

      await expect(repository.appendEvents(events)).rejects.toBeInstanceOf(
        LedgerSequenceError
      )
    })

    it('allows the same slot number across different ledgers', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-a',
          accreditationNumber: 'ACC-acc-a',
          number: 1
        })
      ])

      await expect(
        repository.appendEvents([
          buildLedgerEvent({
            registrationNumber: 'REG-reg-b',
            accreditationNumber: 'ACC-acc-b',
            number: 1
          })
        ])
      ).resolves.toBeDefined()
    })

    it('is a no-op for an empty array', async () => {
      const stored = await repository.appendEvents([])

      expect(stored).toEqual([])
    })

    it('appended events are visible via findLatestInLedger', async () => {
      const events = [
        buildLedgerEvent({
          registrationNumber: 'REG-reg-vis',
          accreditationNumber: 'ACC-acc-vis',
          number: 1
        }),
        buildLedgerEvent({
          registrationNumber: 'REG-reg-vis',
          accreditationNumber: 'ACC-acc-vis',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      ]

      await repository.appendEvents(events)

      const latest = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-reg-vis',
          accreditationNumber: 'ACC-acc-vis'
        })
      )
      expect(latest).not.toBeNull()
      expect(latest.number).toBe(2)
    })
  })
}
