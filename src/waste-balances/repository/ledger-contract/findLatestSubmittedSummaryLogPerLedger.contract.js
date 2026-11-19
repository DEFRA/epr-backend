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
          registrationNumber: 'REG-latest',
          accreditationNumber: 'ACC-latest',
          number: 1,
          payload: { summaryLogId: 'log-1', creditTotal: 100 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-latest',
          accreditationNumber: 'ACC-latest',
          number: 2,
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-latest',
          accreditationNumber: 'ACC-latest',
          number: 3,
          payload: { summaryLogId: 'log-3', creditTotal: 300 }
        })
      ])

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toEqual([
        {
          ledgerId: buildLedgerId({
            registrationNumber: 'REG-latest',
            accreditationNumber: 'ACC-latest'
          }),
          summaryLogId: 'log-3'
        }
      ])
    })

    it('takes the latest submission, not the latest event', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-mixed',
          accreditationNumber: 'ACC-mixed',
          number: 1,
          payload: { summaryLogId: 'log-submitted', creditTotal: 100 }
        })
      ])
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationNumber: 'REG-mixed',
          accreditationNumber: 'ACC-mixed',
          number: 2
        })
      ])

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toEqual([
        {
          ledgerId: buildLedgerId({
            registrationNumber: 'REG-mixed',
            accreditationNumber: 'ACC-mixed'
          }),
          summaryLogId: 'log-submitted'
        }
      ])
    })

    it('returns one entry per partition', async () => {
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

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toHaveLength(2)
      expect(entryFor(result, 'ACC-a')).toMatchObject({
        summaryLogId: 'log-a'
      })
      expect(entryFor(result, 'ACC-b')).toMatchObject({
        summaryLogId: 'log-b'
      })
    })

    it('includes registered-only partitions (accreditationNumber null) as their own entries', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-accredited',
          accreditationNumber: 'ACC-present',
          number: 1,
          payload: { summaryLogId: 'log-accredited', creditTotal: 100 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-registered-only',
          accreditationNumber: null,
          number: 1,
          payload: { summaryLogId: 'log-registered-only', creditTotal: 0 }
        })
      ])

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toHaveLength(2)
      expect(result).toContainEqual({
        ledgerId: buildLedgerId({
          registrationNumber: 'REG-registered-only',
          accreditationNumber: null
        }),
        summaryLogId: 'log-registered-only'
      })
    })

    it('excludes accredited partitions with no submitted summary log', async () => {
      await repository.appendEvents([
        buildPrnCreatedEvent({
          registrationNumber: 'REG-no-submission',
          accreditationNumber: 'ACC-no-submission',
          number: 1
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationNumber: 'REG-submitted',
          accreditationNumber: 'ACC-submitted',
          number: 1,
          payload: { summaryLogId: 'log-submitted', creditTotal: 100 }
        })
      ])

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toEqual([
        {
          ledgerId: buildLedgerId({
            registrationNumber: 'REG-submitted',
            accreditationNumber: 'ACC-submitted'
          }),
          summaryLogId: 'log-submitted'
        }
      ])
    })
  })
}
