import { describe, beforeEach, expect } from 'vitest'

import {
  buildLedgerEvent,
  buildLedgerId,
  buildPrnCreatedEvent
} from '../ledger-test-data.js'

/**
 * @param {import('../ledger-port.js').LatestSubmittedSummaryLogPerLedger[]} entries
 * @param {string} accreditationNumber
 */
const entryFor = (entries, accreditationNumber) =>
  entries.find(
    (entry) => entry.ledgerId.accreditationNumber === accreditationNumber
  )

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
          registrationNumber: 'REG-reg-latest',
          accreditationNumber: 'ACC-acc-latest',
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 100 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-latest',
          accreditationNumber: 'ACC-acc-latest',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-latest',
          accreditationNumber: 'ACC-acc-latest',
          number: 3,
          payload: { summaryLogId: 'log-3', creditTotal: 300 }
        })
      ])

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toEqual([
        {
          ledgerId: buildLedgerId({
            registrationNumber: 'REG-reg-latest',
            accreditationNumber: 'ACC-acc-latest'
          }),
          summaryLogId: 'log-3'
        }
      ])
    })

    it('takes the latest submission, not the latest event', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-mixed',
          accreditationNumber: 'ACC-acc-mixed',
          number: 1,
          payload: { summaryLogId: 'log-submitted', creditTotal: 100 }
        })
      ])
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationNumber: 'REG-reg-mixed',
          accreditationNumber: 'ACC-acc-mixed',
          number: 2
        })
      ])

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toEqual([
        {
          ledgerId: buildLedgerId({
            registrationNumber: 'REG-reg-mixed',
            accreditationNumber: 'ACC-acc-mixed'
          }),
          summaryLogId: 'log-submitted'
        }
      ])
    })

    it('returns one entry per partition', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-a',
          accreditationNumber: 'ACC-acc-a',
          number: 1,
          payload: { summaryLogId: 'log-a', creditTotal: 100 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-b',
          accreditationNumber: 'ACC-acc-b',
          number: 1,
          payload: { summaryLogId: 'log-b', creditTotal: 200 }
        })
      ])

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toHaveLength(2)
      expect(entryFor(result, 'ACC-acc-a')).toMatchObject({
        summaryLogId: 'log-a'
      })
      expect(entryFor(result, 'ACC-acc-b')).toMatchObject({
        summaryLogId: 'log-b'
      })
    })

    it('includes registered-only partitions (accreditationNumber null) as their own entries', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-accredited',
          accreditationNumber: 'ACC-acc-present',
          number: 1,
          payload: { summaryLogId: 'log-accredited', creditTotal: 100 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-registered-only',
          accreditationNumber: null,
          number: 1,
          payload: { summaryLogId: 'log-registered-only', creditTotal: 0 }
        })
      ])

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toHaveLength(2)
      expect(result).toContainEqual({
        ledgerId: buildLedgerId({
          registrationNumber: 'REG-reg-registered-only',
          accreditationNumber: null
        }),
        summaryLogId: 'log-registered-only'
      })
    })

    it('excludes accredited partitions with no submitted summary log', async () => {
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationNumber: 'REG-reg-no-submission',
          accreditationNumber: 'ACC-acc-no-submission',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-reg-submitted',
          accreditationNumber: 'ACC-acc-submitted',
          number: 1,
          payload: { summaryLogId: 'log-submitted', creditTotal: 100 }
        })
      ])

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toEqual([
        {
          ledgerId: buildLedgerId({
            registrationNumber: 'REG-reg-submitted',
            accreditationNumber: 'ACC-acc-submitted'
          }),
          summaryLogId: 'log-submitted'
        }
      ])
    })
  })
}
