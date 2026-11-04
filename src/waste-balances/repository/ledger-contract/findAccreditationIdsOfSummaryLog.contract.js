import { describe, beforeEach, expect } from 'vitest'

import { buildLedgerEvent, buildPrnCreatedEvent } from '../ledger-test-data.js'

const registration = { organisationId: 'org-1', registrationId: 'reg-1' }

/**
 * @param {string} summaryLogId
 * @param {object} [overrides]
 */
const submissionOf = (summaryLogId, overrides = {}) =>
  buildLedgerEvent({
    payload: { summaryLogId, creditTotal: 100 },
    ...overrides
  })

export const testFindAccreditationIdsOfSummaryLogBehaviour = (it) => {
  describe('findAccreditationIdsOfSummaryLog', () => {
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

    it('returns nothing for a summary log no ledger records', async () => {
      await repository.appendEvents([submissionOf('log-other')])

      expect(
        await repository.findAccreditationIdsOfSummaryLog(
          registration,
          'log-absent'
        )
      ).toEqual([])
    })

    it('returns the accreditation of the ledger that records the summary log', async () => {
      await repository.appendEvents([submissionOf('log-1')])
      await repository.appendEvents([
        buildPrnCreatedEvent({ number: 2 }),
        submissionOf('log-2', { number: 3 })
      ])

      expect(
        await repository.findAccreditationIdsOfSummaryLog(registration, 'log-1')
      ).toEqual(['acc-1'])
    })

    it('returns each ledger that records the summary log, the registered-only one as null', async () => {
      await repository.appendEvents([
        submissionOf('log-1', { accreditationId: 'acc-1' })
      ])
      await repository.appendEvents([
        submissionOf('log-1', { accreditationId: 'acc-2' })
      ])
      await repository.appendEvents([
        submissionOf('log-1', { accreditationId: null })
      ])

      const accreditationIds =
        await repository.findAccreditationIdsOfSummaryLog(registration, 'log-1')

      expect(accreditationIds).toHaveLength(3)
      expect(accreditationIds).toEqual(
        expect.arrayContaining(['acc-1', 'acc-2', null])
      )
    })

    it('returns an accreditation once however many times its ledger records the summary log', async () => {
      await repository.appendEvents([submissionOf('log-1')])
      await repository.appendEvents([submissionOf('log-1', { number: 2 })])

      expect(
        await repository.findAccreditationIdsOfSummaryLog(registration, 'log-1')
      ).toEqual(['acc-1'])
    })

    it('reads only the registration it names', async () => {
      await repository.appendEvents([
        submissionOf('log-1', { registrationId: 'reg-other' })
      ])
      await repository.appendEvents([
        submissionOf('log-1', { organisationId: 'org-other' })
      ])

      expect(
        await repository.findAccreditationIdsOfSummaryLog(registration, 'log-1')
      ).toEqual([])
    })
  })
}
