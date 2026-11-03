import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerEvent, buildPrnCreatedEvent } from '../ledger-test-data.js'

const ORG_NUMBER = buildLedgerEvent().organisationNumber

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
            accreditationId: 'acc-latest',
            organisationNumber: ORG_NUMBER,
            registrationNumber: 'REG-reg-latest',
            accreditationNumber: 'ACC-acc-latest'
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
            accreditationId: 'acc-mixed',
            organisationNumber: ORG_NUMBER,
            registrationNumber: 'REG-reg-mixed',
            accreditationNumber: 'ACC-acc-mixed'
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
          accreditationId: null,
          organisationNumber: ORG_NUMBER,
          registrationNumber: 'REG-reg-registered-only',
          accreditationNumber: null
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
            accreditationId: 'acc-submitted',
            organisationNumber: ORG_NUMBER,
            registrationNumber: 'REG-reg-submitted',
            accreditationNumber: 'ACC-acc-submitted'
          },
          summaryLogId: 'log-submitted'
        }
      ])
    })

    it('takes the numbers from the latest submitted event', async () => {
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-n',
          accreditationId: 'acc-n',
          number: 1,
          organisationNumber: '111',
          registrationNumber: 'REG-OLD',
          accreditationNumber: 'ACC-OLD',
          payload: { summaryLogId: 'log-1', creditTotal: 100 }
        })
      ])
      await repository.appendEvents([
        buildLedgerEvent({
          registrationId: 'reg-n',
          accreditationId: 'acc-n',
          number: 2,
          organisationNumber: '222',
          registrationNumber: 'REG-NEW',
          accreditationNumber: 'ACC-NEW',
          payload: { summaryLogId: 'log-2', creditTotal: 200 }
        })
      ])

      const result = await repository.findLatestSubmittedSummaryLogPerLedger()

      expect(result).toEqual([
        {
          ledgerId: {
            organisationId: 'org-1',
            registrationId: 'reg-n',
            accreditationId: 'acc-n',
            organisationNumber: '222',
            registrationNumber: 'REG-NEW',
            accreditationNumber: 'ACC-NEW'
          },
          summaryLogId: 'log-2'
        }
      ])
    })

    it.for(['organisationNumber', 'registrationNumber', 'accreditationNumber'])(
      'throws, naming the ledger and the number, when the latest event lacks its %s',
      async (missing) => {
        await repository.appendEvents([
          buildLedgerEvent({
            registrationId: 'reg-bare',
            accreditationId: 'acc-bare',
            number: 1,
            payload: { summaryLogId: 'log-1', creditTotal: 100 }
          })
        ])
        await repository.appendEvents([
          buildLedgerEvent({
            registrationId: 'reg-bare',
            accreditationId: 'acc-bare',
            number: 2,
            [missing]: undefined,
            payload: { summaryLogId: 'log-2', creditTotal: 200 }
          })
        ])

        await expect(
          repository.findLatestSubmittedSummaryLogPerLedger()
        ).rejects.toThrow(
          new RegExp(`ledger org-1/reg-bare/acc-bare.*${missing}`)
        )
      }
    )
  })
}
