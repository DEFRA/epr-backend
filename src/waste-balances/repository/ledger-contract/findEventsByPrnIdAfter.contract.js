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
          registrationId: 'reg-prn',
          accreditationId: 'acc-prn',
          number: 1,
          payload: { prnId: 'prn-watermark', amount: 50 }
        })
      ])
      await repository.appendEvents([
        buildPrnCancelledAfterIssueEvent({
          registrationId: 'reg-prn',
          accreditationId: 'acc-prn',
          number: 2,
          payload: { prnId: 'prn-watermark', amount: 50 }
        })
      ])

      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          registrationId: 'reg-prn',
          accreditationId: 'acc-prn'
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
          registrationId: 'reg-wm',
          accreditationId: 'acc-wm',
          number: 1,
          payload: { prnId: 'prn-filter', amount: 50 }
        })
      ])
      await repository.appendEvents([
        buildPrnCancelledAfterIssueEvent({
          registrationId: 'reg-wm',
          accreditationId: 'acc-wm',
          number: 2,
          payload: { prnId: 'prn-filter', amount: 50 }
        })
      ])

      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({ registrationId: 'reg-wm', accreditationId: 'acc-wm' }),
        'prn-filter',
        1
      )

      expect(result).toHaveLength(1)
      expect(result[0].number).toBe(2)
    })

    it('returns an empty array when no events exist after watermark', async () => {
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationId: 'reg-caught-up',
          accreditationId: 'acc-caught-up',
          number: 1,
          payload: { prnId: 'prn-caught-up', amount: 50 }
        })
      ])

      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          registrationId: 'reg-caught-up',
          accreditationId: 'acc-caught-up'
        }),
        'prn-caught-up',
        1
      )

      expect(result).toEqual([])
    })

    it('returns an empty array when no events exist for the prnId', async () => {
      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          registrationId: 'reg-none',
          accreditationId: 'acc-none'
        }),
        'prn-nonexistent',
        0
      )

      expect(result).toEqual([])
    })

    it('does not return events from a different ledger', async () => {
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationId: 'reg-a',
          accreditationId: 'acc-a',
          number: 1,
          payload: { prnId: 'prn-shared', amount: 50 }
        })
      ])
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationId: 'reg-b',
          accreditationId: 'acc-b',
          number: 1,
          payload: { prnId: 'prn-shared', amount: 30 }
        })
      ])

      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({ registrationId: 'reg-a', accreditationId: 'acc-a' }),
        'prn-shared',
        0
      )

      expect(result).toHaveLength(1)
      expect(result[0].registrationId).toBe('reg-a')
      expect(result[0].accreditationId).toBe('acc-a')
    })

    it('does not read a ledger named under a different organisation', async () => {
      await repository.appendEvents([
        buildPrnCreatedEvent({
          organisationId: 'org-owner',
          registrationId: 'reg-owned',
          accreditationId: 'acc-owned',
          number: 1,
          payload: { prnId: 'prn-owned', amount: 50 }
        })
      ])

      const result = await repository.findEventsByPrnIdAfter(
        buildLedgerId({
          organisationId: 'org-stranger',
          registrationId: 'reg-owned',
          accreditationId: 'acc-owned'
        }),
        'prn-owned',
        0
      )

      expect(result).toEqual([])
    })
  })
}
