import { describe, beforeEach, expect } from 'vitest'

import { anotherOrganisationNumber } from '#waste-records/repository/test-data.js'

import { LEDGER_EVENT_KIND } from '../ledger-schema.js'
import {
  buildLedgerId,
  buildPrnCreatedEvent,
  buildPrnCancelledAfterIssueEvent
} from '../ledger-test-data.js'

export const testFindEventsByPrnIdAfterBehaviour = (it) => {
  describe('findEventsByPrnIdAfter', () => {
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

    it('returns events with number greater than the watermark', async () => {
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationNumber: 'REG-prn',
          accreditationNumber: 'ACC-prn',
          number: 1,
          payload: { prnId: 'prn-watermark', amount: 50 }
        })
      ])
      await repository.appendEvents([
        buildPrnCancelledAfterIssueEvent({
          registrationNumber: 'REG-prn',
          accreditationNumber: 'ACC-prn',
          number: 2,
          payload: { prnId: 'prn-watermark', amount: 50 }
        })
      ])

      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          registrationNumber: 'REG-prn',
          accreditationNumber: 'ACC-prn'
        }),
        'prn-watermark',
        0
      )

      expect(result).toHaveLength(2)
      expect(result[0].number).toBe(1)
      expect(result[0].kind).toBe(LEDGER_EVENT_KIND.PRN_CREATED)
      expect(result[1].number).toBe(2)
      expect(result[1].kind).toBe(LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE)
    })

    it('filters out events at or below the watermark', async () => {
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationNumber: 'REG-wm',
          accreditationNumber: 'ACC-wm',
          number: 1,
          payload: { prnId: 'prn-filter', amount: 50 }
        })
      ])
      await repository.appendEvents([
        buildPrnCancelledAfterIssueEvent({
          registrationNumber: 'REG-wm',
          accreditationNumber: 'ACC-wm',
          number: 2,
          payload: { prnId: 'prn-filter', amount: 50 }
        })
      ])

      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          registrationNumber: 'REG-wm',
          accreditationNumber: 'ACC-wm'
        }),
        'prn-filter',
        1
      )

      expect(result).toHaveLength(1)
      expect(result[0].number).toBe(2)
    })

    it('returns an empty array when no events exist after watermark', async () => {
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationNumber: 'REG-caught-up',
          accreditationNumber: 'ACC-caught-up',
          number: 1,
          payload: { prnId: 'prn-caught-up', amount: 50 }
        })
      ])

      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          registrationNumber: 'REG-caught-up',
          accreditationNumber: 'ACC-caught-up'
        }),
        'prn-caught-up',
        1
      )

      expect(result).toEqual([])
    })

    it('returns an empty array when no events exist for the prnId', async () => {
      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          registrationNumber: 'REG-none',
          accreditationNumber: 'ACC-none'
        }),
        'prn-nonexistent',
        0
      )

      expect(result).toEqual([])
    })

    it('does not return events from a different ledger', async () => {
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationNumber: 'REG-a',
          accreditationNumber: 'ACC-a',
          number: 1,
          payload: { prnId: 'prn-shared', amount: 50 }
        })
      ])
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationNumber: 'REG-b',
          accreditationNumber: 'ACC-b',
          number: 1,
          payload: { prnId: 'prn-shared', amount: 30 }
        })
      ])

      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          registrationNumber: 'REG-a',
          accreditationNumber: 'ACC-a'
        }),
        'prn-shared',
        0
      )

      expect(result).toHaveLength(1)
      expect(result[0].registrationNumber).toBe('REG-a')
      expect(result[0].accreditationNumber).toBe('ACC-a')
    })

    it('does not read a ledger named under a different organisation', async () => {
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationNumber: 'REG-owned',
          accreditationNumber: 'ACC-owned',
          number: 1,
          payload: { prnId: 'prn-owned', amount: 50 }
        })
      ])

      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          organisationNumber: anotherOrganisationNumber(),
          registrationNumber: 'REG-owned',
          accreditationNumber: 'ACC-owned'
        }),
        'prn-owned',
        0
      )

      expect(result).toEqual([])
    })
  })
}
