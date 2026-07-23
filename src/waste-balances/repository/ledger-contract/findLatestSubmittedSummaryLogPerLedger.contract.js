import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerEvent, buildPrnCreatedEvent } from '../ledger-test-data.js'

/**
 * @param {import('../ledger-port.js').LatestSubmittedSummaryLogPerLedger[]} entries
 * @param {string} accreditationId
 */
const entryFor = (entries, accreditationId) =>
  entries.find((entry) => entry.ledgerId.accreditationId === accreditationId)

export const testFindLatestSubmittedSummaryLogPerLedgerBehaviour = (it) => {
  describe('findLatestSubmittedSummaryLogPerLedger', () => {
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

    it('returns an empty array when no events exist', async () => {
      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toEqual([])
    })

    it('returns the summaryLogId of the highest-numbered submission per partition', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-latest',
          accreditationId: 'acc-latest',
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 100 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-latest',
          accreditationId: 'acc-latest',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-latest',
          accreditationId: 'acc-latest',
          number: 3,
          payload: { summaryLogId: 'log-3', creditTotal: 300 }
        })
      ])

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toEqual([
        {
          ledgerId: {
            organisationId: 'org-1',
            registrationId: 'reg-latest',
            accreditationId: 'acc-latest'
          },
          summaryLogId: 'log-3'
        }
      ])
    })

    it('takes the latest submission, not the latest event', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-mixed',
          accreditationId: 'acc-mixed',
          number: 1,
          payload: { summaryLogId: 'log-submitted', creditTotal: 100 }
        })
      ])
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationId: 'reg-mixed',
          accreditationId: 'acc-mixed',
          number: 2
        })
      ])

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toEqual([
        {
          ledgerId: {
            organisationId: 'org-1',
            registrationId: 'reg-mixed',
            accreditationId: 'acc-mixed'
          },
          summaryLogId: 'log-submitted'
        }
      ])
    })

    it('returns one entry per partition', async () => {
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

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toHaveLength(2)
      expect(entryFor(result, 'acc-a')).toMatchObject({ summaryLogId: 'log-a' })
      expect(entryFor(result, 'acc-b')).toMatchObject({ summaryLogId: 'log-b' })
    })

    it('includes registered-only partitions (accreditationId null) as their own entries', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-accredited',
          accreditationId: 'acc-present',
          number: 1,
          payload: { summaryLogId: 'log-accredited', creditTotal: 100 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-registered-only',
          accreditationId: null,
          number: 1,
          payload: { summaryLogId: 'log-registered-only', creditTotal: 0 }
        })
      ])

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toHaveLength(2)
      expect(result).toContainEqual({
        ledgerId: {
          organisationId: 'org-1',
          registrationId: 'reg-registered-only',
          accreditationId: null
        },
        summaryLogId: 'log-registered-only'
      })
    })

    it('excludes accredited partitions with no submitted summary log', async () => {
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationId: 'reg-no-submission',
          accreditationId: 'acc-no-submission',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-submitted',
          accreditationId: 'acc-submitted',
          number: 1,
          payload: { summaryLogId: 'log-submitted', creditTotal: 100 }
        })
      ])

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toEqual([
        {
          ledgerId: {
            organisationId: 'org-1',
            registrationId: 'reg-submitted',
            accreditationId: 'acc-submitted'
          },
          summaryLogId: 'log-submitted'
        }
      ])
    })
  })
}
