import { describe, beforeEach, expect } from 'vitest'

import { anotherOrganisationNumber } from '#waste-records/repository/test-data.js'

import { LEDGER_EVENT_KIND } from '../ledger-schema.js'
import {
  buildLedgerEvent,
  buildLedgerId,
  buildPrnCreatedEvent
} from '../ledger-test-data.js'

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
          registrationNumber: 'REG-kind',
          accreditationNumber: 'ACC-kind',
          number: 1
        })
      ])

      const result = await repository.findLatestInLedgerByKind(
        buildLedgerId({
          registrationNumber: 'REG-kind',
          accreditationNumber: 'ACC-kind'
        }),
        LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )

      expect(result).toBeNull()
    })

    it('returns the highest-numbered event of the specified kind', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-filter',
          accreditationNumber: 'ACC-filter',
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 100 }
        })
      ])
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationNumber: 'REG-filter',
          accreditationNumber: 'ACC-filter',
          number: 2,
          payload: { prnId: 'prn-1', amount: 50 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-filter',
          accreditationNumber: 'ACC-filter',
          number: 3,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      ])

      const result = await repository.findLatestInLedgerByKind(
        buildLedgerId({
          registrationNumber: 'REG-filter',
          accreditationNumber: 'ACC-filter'
        }),
        LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )

      expect(result.number).toBe(3)
      expect(result.payload.summaryLogId).toBe('log-2')
    })

    it('isolates results by ledgerId', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-a',
          accreditationNumber: 'ACC-a',
          number: 1,
          payload: { summaryLogId: 'log-a', creditTotal: 100 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-b',
          accreditationNumber: 'ACC-b',
          number: 1,
          payload: { summaryLogId: 'log-b', creditTotal: 200 }
        })
      ])

      const a = await repository.findLatestInLedgerByKind(
        buildLedgerId({
          registrationNumber: 'REG-a',
          accreditationNumber: 'ACC-a'
        }),
        LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )
      const b = await repository.findLatestInLedgerByKind(
        buildLedgerId({
          registrationNumber: 'REG-b',
          accreditationNumber: 'ACC-b'
        }),
        LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )

      expect(a.accreditationNumber).toBe('ACC-a')
      expect(a.payload.summaryLogId).toBe('log-a')
      expect(b.accreditationNumber).toBe('ACC-b')
      expect(b.payload.summaryLogId).toBe('log-b')
    })

    it('does not read a ledger named under a different organisation', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-owned',
          accreditationNumber: 'ACC-owned',
          number: 1,
          payload: { summaryLogId: 'log-owned', creditTotal: 100 }
        })
      ])

      const result = await repository.findLatestInLedgerByKind(
        buildLedgerId({
          organisationNumber: anotherOrganisationNumber(),
          registrationNumber: 'REG-owned',
          accreditationNumber: 'ACC-owned'
        }),
        LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )

      expect(result).toBeNull()
    })

    it('treats null and non-null accreditation numbers as separate ledgers', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-null',
          accreditationNumber: null,
          number: 1,
          payload: { summaryLogId: 'log-null', creditTotal: 10 },
          closingBalance: { amount: 10, availableAmount: 10 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-null',
          accreditationNumber: 'ACC-present',
          number: 1,
          payload: { summaryLogId: 'log-present', creditTotal: 999 },
          closingBalance: { amount: 999, availableAmount: 999 }
        })
      ])

      const nullResult = await repository.findLatestInLedgerByKind(
        buildLedgerId({
          registrationNumber: 'REG-null',
          accreditationNumber: null
        }),
        LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )
      const nonNullResult = await repository.findLatestInLedgerByKind(
        buildLedgerId({
          registrationNumber: 'REG-null',
          accreditationNumber: 'ACC-present'
        }),
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
        buildLedgerId({
          registrationNumber: 'REG-empty',
          accreditationNumber: 'ACC-empty'
        }),
        LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )

      expect(result).toBeNull()
    })
  })
}
