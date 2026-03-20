import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { beforeEach, describe, expect } from 'vitest'
import { buildPrn } from './test-data.js'

const ONE_HOUR_MS = 3600000

const PERIOD_START = new Date('2025-01-01T00:00:00Z')
const PERIOD_END = new Date('2025-12-31T23:59:59Z')
const IN_PERIOD = new Date('2025-06-15T12:00:00Z')
const BEFORE_PERIOD = new Date('2024-12-31T23:59:59Z')
const AFTER_PERIOD = new Date('2026-01-01T00:00:00Z')

/**
 * Builds a PRN whose status.history contains an awaiting_acceptance entry at the given date.
 *
 * @param {{ organisationId: string, registrationId: string, tonnage: number, historyEntryAt: Date, historyStatus?: string }} params
 */
function buildPrnWithHistoryEntry({
  organisationId,
  registrationId,
  tonnage,
  historyEntryAt,
  historyStatus = PRN_STATUS.AWAITING_ACCEPTANCE
}) {
  return buildPrn({
    organisation: {
      id: organisationId,
      name: 'Test Organisation',
      tradingName: 'Test Trading'
    },
    registrationId,
    tonnage,
    status: {
      currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      currentStatusAt: historyEntryAt,
      history: [
        {
          status: PRN_STATUS.DRAFT,
          at: new Date(historyEntryAt.getTime() - ONE_HOUR_MS),
          by: { id: 'creator', name: 'Creator' }
        },
        {
          status: historyStatus,
          at: historyEntryAt,
          by: { id: 'issuer', name: 'Issuer' }
        }
      ]
    }
  })
}

export const testGetTotalIssuedTonnage = (it) => {
  describe('getTotalIssuedTonnage', () => {
    let repository
    let organisationId
    let registrationId

    beforeEach(async ({ prnRepository }) => {
      repository = prnRepository
      organisationId = `org-tonnage-${Date.now()}-${Math.random()}`
      registrationId = `reg-tonnage-${Date.now()}-${Math.random()}`
    })

    const defaultStatuses = [
      PRN_STATUS.AWAITING_ACCEPTANCE,
      PRN_STATUS.ACCEPTED
    ]

    it('includes PRN with awaiting_acceptance history entry in period', async () => {
      await repository.create(
        buildPrnWithHistoryEntry({
          organisationId,
          registrationId,
          tonnage: 50,
          historyEntryAt: IN_PERIOD,
          historyStatus: PRN_STATUS.AWAITING_ACCEPTANCE
        })
      )

      const total = await repository.getTotalIssuedTonnage({
        organisationId,
        registrationId,
        statuses: defaultStatuses,
        startDate: PERIOD_START,
        endDate: PERIOD_END
      })

      expect(total).toBe(50)
    })

    it('includes PRN with accepted history entry in period', async () => {
      await repository.create(
        buildPrnWithHistoryEntry({
          organisationId,
          registrationId,
          tonnage: 75,
          historyEntryAt: IN_PERIOD,
          historyStatus: PRN_STATUS.ACCEPTED
        })
      )

      const total = await repository.getTotalIssuedTonnage({
        organisationId,
        registrationId,
        statuses: defaultStatuses,
        startDate: PERIOD_START,
        endDate: PERIOD_END
      })

      expect(total).toBe(75)
    })

    it('includes PRN with both awaiting_acceptance and accepted entries in period only once', async () => {
      await repository.create(
        buildPrn({
          organisation: {
            id: organisationId,
            name: 'Test Organisation',
            tradingName: 'Test Trading'
          },
          registrationId,
          tonnage: 100,
          status: {
            currentStatus: PRN_STATUS.ACCEPTED,
            currentStatusAt: IN_PERIOD,
            history: [
              {
                status: PRN_STATUS.DRAFT,
                at: new Date(IN_PERIOD.getTime() - 2 * ONE_HOUR_MS),
                by: { id: 'creator', name: 'Creator' }
              },
              {
                status: PRN_STATUS.AWAITING_ACCEPTANCE,
                at: new Date(IN_PERIOD.getTime() - ONE_HOUR_MS),
                by: { id: 'issuer', name: 'Issuer' }
              },
              {
                status: PRN_STATUS.ACCEPTED,
                at: IN_PERIOD,
                by: { id: 'acceptor', name: 'Acceptor' }
              }
            ]
          }
        })
      )

      const total = await repository.getTotalIssuedTonnage({
        organisationId,
        registrationId,
        statuses: defaultStatuses,
        startDate: PERIOD_START,
        endDate: PERIOD_END
      })

      expect(total).toBe(100)
    })

    it('excludes PRN whose matching history entry falls outside period', async () => {
      await repository.create(
        buildPrnWithHistoryEntry({
          organisationId,
          registrationId,
          tonnage: 60,
          historyEntryAt: BEFORE_PERIOD,
          historyStatus: PRN_STATUS.AWAITING_ACCEPTANCE
        })
      )
      await repository.create(
        buildPrnWithHistoryEntry({
          organisationId,
          registrationId,
          tonnage: 60,
          historyEntryAt: AFTER_PERIOD,
          historyStatus: PRN_STATUS.AWAITING_ACCEPTANCE
        })
      )

      const total = await repository.getTotalIssuedTonnage({
        organisationId,
        registrationId,
        statuses: defaultStatuses,
        startDate: PERIOD_START,
        endDate: PERIOD_END
      })

      expect(total).toBe(0)
    })

    it('sums tonnage across multiple PRNs in period', async () => {
      await repository.create(
        buildPrnWithHistoryEntry({
          organisationId,
          registrationId,
          tonnage: 30,
          historyEntryAt: IN_PERIOD
        })
      )
      await repository.create(
        buildPrnWithHistoryEntry({
          organisationId,
          registrationId,
          tonnage: 45,
          historyEntryAt: IN_PERIOD
        })
      )

      const total = await repository.getTotalIssuedTonnage({
        organisationId,
        registrationId,
        statuses: defaultStatuses,
        startDate: PERIOD_START,
        endDate: PERIOD_END
      })

      expect(total).toBe(75)
    })

    it('returns 0 when no PRNs match', async () => {
      const total = await repository.getTotalIssuedTonnage({
        organisationId,
        registrationId,
        statuses: defaultStatuses,
        startDate: PERIOD_START,
        endDate: PERIOD_END
      })

      expect(total).toBe(0)
    })
  })
}
