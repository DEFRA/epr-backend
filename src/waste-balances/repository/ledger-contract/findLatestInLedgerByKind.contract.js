import { describe, beforeEach, expect } from 'vitest'

import { LEDGER_EVENT_KIND } from '../ledger-schema.js'
import { buildLedgerEvent, buildPrnCreatedEvent } from '../ledger-test-data.js'

export const testFindLatestInLedgerByKindBehaviour = (it) => {
  describe('findLatestInLedgerByKind', () => {
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

    it('returns null when no events of the given kind exist', async () => {
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationId: 'reg-kind',
          accreditationId: 'acc-kind',
          number: 1
        })
      ])

      const result = await repository.findLatestInLedgerByKind(
        'reg-kind',
        'acc-kind',
        LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )

      expect(result).toBeNull()
    })

    it('returns the highest-numbered event of the specified kind', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-filter',
          accreditationId: 'acc-filter',
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 100 }
        })
      ])
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationId: 'reg-filter',
          accreditationId: 'acc-filter',
          number: 2,
          payload: { prnId: 'prn-1', amount: 50 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-filter',
          accreditationId: 'acc-filter',
          number: 3,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      ])

      const result = await repository.findLatestInLedgerByKind(
        'reg-filter',
        'acc-filter',
        LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )

      expect(result.number).toBe(3)
      expect(result.payload.summaryLogId).toBe('log-2')
    })

    it('isolates results by ledgerId', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-a',
          accreditationId: 'acc-a',
          number: 1,
          payload: { summaryLogId: 'log-a', creditTotal: 100 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-b',
          accreditationId: 'acc-b',
          number: 1,
          payload: { summaryLogId: 'log-b', creditTotal: 200 }
        })
      ])

      const a = await repository.findLatestInLedgerByKind(
        'reg-a',
        'acc-a',
        LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )
      const b = await repository.findLatestInLedgerByKind(
        'reg-b',
        'acc-b',
        LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )

      expect(a.accreditationId).toBe('acc-a')
      expect(a.payload.summaryLogId).toBe('log-a')
      expect(b.accreditationId).toBe('acc-b')
      expect(b.payload.summaryLogId).toBe('log-b')
    })

    it('treats null and non-null accreditationId as separate ledgers', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-null',
          accreditationId: null,
          number: 1,
          payload: { summaryLogId: 'log-null', creditTotal: 10 },
          closingBalance: { amount: 10, availableAmount: 10 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-null',
          accreditationId: 'acc-present',
          number: 1,
          payload: { summaryLogId: 'log-present', creditTotal: 999 },
          closingBalance: { amount: 999, availableAmount: 999 }
        })
      ])

      const nullResult = await repository.findLatestInLedgerByKind(
        'reg-null',
        null,
        LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )
      const nonNullResult = await repository.findLatestInLedgerByKind(
        'reg-null',
        'acc-present',
        LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
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

    it('returns null when the ledger is empty', async () => {
      const result = await repository.findLatestInLedgerByKind(
        'reg-empty',
        'acc-empty',
        LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )

      expect(result).toBeNull()
    })
  })
}
