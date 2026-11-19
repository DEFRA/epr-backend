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
        registrationNumber: 'REG-append',
        accreditationNumber: 'ACC-append',
        number: 1
      })

      const [stored] = await repository.appendEvents([event])

      expect(stored).not.toHaveProperty('id')
      expect(stored.registrationNumber).toBe('REG-append')
      expect(stored.accreditationNumber).toBe('ACC-append')
      expect(stored.number).toBe(1)
      expect(stored.kind).toBe(event.kind)
      expect(stored.payload).toEqual(event.payload)
      expect(stored.openingBalance).toEqual(event.openingBalance)
      expect(stored.closingBalance).toEqual(event.closingBalance)
    })

    it('inserts multiple events and returns them in order', async () => {
      const events = [
        buildLedgerEvent({
          registrationNumber: 'REG-bulk',
          accreditationNumber: 'ACC-bulk',
          number: 1
        }),
        buildLedgerEvent({
          registrationNumber: 'REG-bulk',
          accreditationNumber: 'ACC-bulk',
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
          registrationNumber: 'REG-seq',
          accreditationNumber: 'ACC-seq',
          number: 1
        })
      ])

      const events = [
        buildLedgerEvent({
          registrationNumber: 'REG-seq',
          accreditationNumber: 'ACC-seq',
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
          registrationNumber: 'REG-empty',
          accreditationNumber: 'ACC-empty',
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
        registrationNumber: 'REG-seq-err',
        accreditationNumber: 'ACC-seq-err'
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
          registrationNumber: 'REG-occupied',
          accreditationNumber: 'ACC-occupied',
          number: 1
        })
      ])

      const events = [
        buildLedgerEvent({
          registrationNumber: 'REG-occupied',
          accreditationNumber: 'ACC-occupied',
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
        registrationNumber: 'REG-slot-err',
        accreditationNumber: 'ACC-slot-err'
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
          registrationNumber: 'REG-gap',
          accreditationNumber: 'ACC-gap',
          number: 1
        }),
        buildLedgerEvent({
          registrationNumber: 'REG-gap',
          accreditationNumber: 'ACC-gap',
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
          registrationNumber: 'REG-a',
          accreditationNumber: 'ACC-a',
          number: 1
        })
      ])

      await expect(
        repository.appendEvents([
          buildLedgerEvent({
            registrationNumber: 'REG-b',
            accreditationNumber: 'ACC-b',
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
          registrationNumber: 'REG-vis',
          accreditationNumber: 'ACC-vis',
          number: 1
        }),
        buildLedgerEvent({
          registrationNumber: 'REG-vis',
          accreditationNumber: 'ACC-vis',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      ]

      await repository.appendEvents(events)

      const latest = await repository.findLatestInLedger(
        buildLedgerId({
          registrationNumber: 'REG-vis',
          accreditationNumber: 'ACC-vis'
        })
      )
      expect(latest).not.toBeNull()
      expect(latest.number).toBe(2)
    })
  })
}
