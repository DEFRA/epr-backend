import { anotherOrganisationNumber } from '#waste-records/repository/test-data.js'
import { describe, beforeEach, expect } from 'vitest'

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
          registrationNumber: 'REG-reg-prn',
          accreditationNumber: 'ACC-acc-prn',
          number: 1,
          payload: { prnId: 'prn-watermark', amount: 50 }
        })
      ])
      await repository.appendEvents([
        buildPrnCancelledAfterIssueEvent({
          registrationNumber: 'REG-reg-prn',
          accreditationNumber: 'ACC-acc-prn',
          number: 2,
          payload: { prnId: 'prn-watermark', amount: 50 }
        })
      ])

      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          registrationNumber: 'REG-reg-prn',
          accreditationNumber: 'ACC-acc-prn'
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
          registrationNumber: 'REG-reg-wm',
          accreditationNumber: 'ACC-acc-wm',
          number: 1,
          payload: { prnId: 'prn-filter', amount: 50 }
        })
      ])
      await repository.appendEvents([
        buildPrnCancelledAfterIssueEvent({
          registrationNumber: 'REG-reg-wm',
          accreditationNumber: 'ACC-acc-wm',
          number: 2,
          payload: { prnId: 'prn-filter', amount: 50 }
        })
      ])

      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          registrationNumber: 'REG-reg-wm',
          accreditationNumber: 'ACC-acc-wm'
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
          registrationNumber: 'REG-reg-caught-up',
          accreditationNumber: 'ACC-acc-caught-up',
          number: 1,
          payload: { prnId: 'prn-caught-up', amount: 50 }
        })
      ])

      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          registrationNumber: 'REG-reg-caught-up',
          accreditationNumber: 'ACC-acc-caught-up'
        }),
        'prn-caught-up',
        1
      )

      expect(result).toEqual([])
    })

    it('returns an empty array when no events exist for the prnId', async () => {
      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          registrationNumber: 'REG-reg-none',
          accreditationNumber: 'ACC-acc-none'
        }),
        'prn-nonexistent',
        0
      )

      expect(result).toEqual([])
    })

    it('does not return events from a different ledger', async () => {
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationNumber: 'REG-reg-a',
          accreditationNumber: 'ACC-acc-a',
          number: 1,
          payload: { prnId: 'prn-shared', amount: 50 }
        })
      ])
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationNumber: 'REG-reg-b',
          accreditationNumber: 'ACC-acc-b',
          number: 1,
          payload: { prnId: 'prn-shared', amount: 30 }
        })
      ])

      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          registrationNumber: 'REG-reg-a',
          accreditationNumber: 'ACC-acc-a'
        }),
        'prn-shared',
        0
      )

      expect(result).toHaveLength(1)
      expect(result[0].registrationNumber).toBe('REG-reg-a')
      expect(result[0].accreditationNumber).toBe('ACC-acc-a')
    })

    it('does not read a ledger named under a different organisation', async () => {
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationNumber: 'REG-reg-owned',
          accreditationNumber: 'ACC-acc-owned',
          number: 1,
          payload: { prnId: 'prn-owned', amount: 50 }
        })
      ])

      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          organisationNumber: anotherOrganisationNumber(),
          registrationNumber: 'REG-reg-owned',
          accreditationNumber: 'ACC-acc-owned'
        }),
        'prn-owned',
        0
      )

      expect(result).toEqual([])
    })
  })
}
