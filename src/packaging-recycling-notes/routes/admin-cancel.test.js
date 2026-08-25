import { StatusCodes } from 'http-status-codes'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MATERIAL, REGULATOR } from '#domain/organisations/model.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import {
  buildLedgerEvent,
  buildPrnCancelledAfterIssueEvent
} from '#waste-balances/repository/ledger-test-data.js'
import { LedgerSlotConflictError } from '#waste-balances/repository/ledger-port.js'
import { createMockLogger } from '#test/mock-logger.js'
import { createTestServer } from '#test/create-test-server.js'
import { partialMock } from '#test/type-helpers.js'
import {
  asServiceMaintainerWrite,
  asServiceMaintainerRead,
  asSupport,
  asUnscopedAdminUser
} from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { adminPackagingRecyclingNotesCancelPath } from './admin-cancel.js'

/** @import { PackagingRecyclingNote, PrnStatus } from '#packaging-recycling-notes/domain/model.js' */

const mockCdpAuditing = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockCdpAuditing(...args)
}))

const prnId = '507f1f77bcf86cd799439011'
// markActiveReportsStaleForPrnCancellation (ADR-0042) validates organisationId
// and registrationId as 24-char hex ObjectIds, so these must be too — unlike
// most PRN fixtures elsewhere that use plain strings.
const organisationId = '507f1f77bcf86cd799439012'
const registrationId = '507f1f77bcf86cd799439013'
const accreditationId = '507f1f77bcf86cd799439014'

const cancelUrl = `/v1/admin/packaging-recycling-notes/${prnId}/cancel`

const SEED_BALANCE = { amount: 500, availableAmount: 500 }
const ISSUED_AT = new Date('2026-01-15T10:00:00Z')

/** @param {{ amount: number, availableAmount: number }} closingBalance */
const openingBalanceEvent = (closingBalance = SEED_BALANCE) =>
  buildLedgerEvent({
    registrationId,
    accreditationId,
    organisationId,
    number: 1,
    payload: { summaryLogId: 'log-1', creditTotal: closingBalance.amount },
    openingBalance: { amount: 0, availableAmount: 0 },
    closingBalance
  })

/**
 * @param {Object} [options]
 * @param {PrnStatus} [options.currentStatus]
 * @param {number} [options.accreditationYear]
 * @param {number} [options.tonnage]
 * @param {Date} [options.issuedAt]
 */
const buildAcceptedPrn = ({
  currentStatus = PRN_STATUS.ACCEPTED,
  accreditationYear = 2026,
  tonnage = 500,
  issuedAt = ISSUED_AT
} = {}) => ({
  id: prnId,
  version: 1,
  schemaVersion: 2,
  organisation: { id: organisationId, name: 'Test Organisation' },
  registrationId,
  accreditation: {
    id: accreditationId,
    accreditationNumber: 'ACC-2026-001',
    accreditationYear,
    material: MATERIAL.PLASTIC,
    submittedToRegulator: REGULATOR.EA
  },
  obligationYear: accreditationYear,
  issuedToOrganisation: { id: 'producer-org-789', name: 'Producer Org' },
  tonnage,
  isExport: false,
  isDecemberWaste: false,
  createdAt: new Date('2026-01-10T10:00:00Z'),
  createdBy: { id: 'user-123', name: 'Test User' },
  updatedAt: new Date('2026-01-15T10:00:00Z'),
  updatedBy: { id: 'user-issuer', name: 'Issuer User' },
  status: {
    currentStatus,
    currentStatusAt: new Date('2026-01-15T10:00:00Z'),
    issued: { at: issuedAt, by: { id: 'user-issuer', name: 'Issuer User' } },
    accepted: {
      at: new Date('2026-01-16T10:00:00Z'),
      by: { id: 'producer-1', name: 'Producer Contact' }
    },
    history: []
  }
})

let server
let ledgerRepository
let packagingRecyclingNotesRepository
let reportsRepository

/**
 * @param {PackagingRecyclingNote | null} prn
 * @param {Object} [options]
 * @param {Map<string, object>} [options.reports]
 * @param {{ amount: number, availableAmount: number } | null} [options.closingBalance]
 * @param {boolean} [options.cancellationEnabled]
 */
const startServer = async (
  prn,
  {
    reports = new Map(),
    closingBalance = SEED_BALANCE,
    cancellationEnabled = true
  } = {}
) => {
  ledgerRepository = createInMemoryLedgerRepository(
    closingBalance ? [partialMock(openingBalanceEvent(closingBalance))] : []
  )()
  const prnRepositoryFactory = createInMemoryPackagingRecyclingNotesRepository(
    prn ? [prn] : []
  )
  packagingRecyclingNotesRepository = prnRepositoryFactory(createMockLogger())
  const reportsRepositoryFactory = createInMemoryReportsRepository(reports)
  reportsRepository = reportsRepositoryFactory()

  server = await createTestServer({
    repositories: {
      packagingRecyclingNotesRepository: prnRepositoryFactory,
      ledgerRepository: () => ledgerRepository,
      organisationsRepository: () => ({}),
      reportsRepository: reportsRepositoryFactory
    },
    featureFlags: createInMemoryFeatureFlags({
      prnAdminCancellation: cancellationEnabled
    })
  })
  return server
}

describe(`POST ${adminPackagingRecyclingNotesCancelPath}`, () => {
  setupAuthContext()

  afterEach(async () => {
    await server.stop()
    vi.clearAllMocks()
  })

  it('cancels an accepted PRN within the window, crediting the full tonnage back to both balances', async () => {
    await startServer(buildAcceptedPrn({ tonnage: 500 }))

    const response = await server.inject({
      method: 'POST',
      url: cancelUrl,
      ...asServiceMaintainerWrite()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const body = JSON.parse(response.payload)
    expect(body.status).toBe(PRN_STATUS.CANCELLED)
    expect(body.obligationYear).toBe(2026)

    const stored = await packagingRecyclingNotesRepository.findById(prnId)
    expect(stored?.status.currentStatus).toBe(PRN_STATUS.CANCELLED)
    expect(stored?.status.cancelled?.by).toEqual({
      id: 'test-maintainer-id',
      name: 'maintainer@example.com'
    })
    // Cancelled directly from `accepted`, bypassing the producer-rejection path
    // (`awaiting_acceptance -> awaiting_cancellation`), so `status.rejected`
    // must stay unset — otherwise the external API would report a
    // `rejectedAt` for a PRN that was never rejected.
    expect(stored?.status.rejected).toBeUndefined()

    const latestEvent = await ledgerRepository.findLatestInLedger({
      organisationId,
      registrationId,
      accreditationId
    })
    expect(latestEvent.kind).toBe(LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE)
    expect(latestEvent.payload).toEqual({ prnId, amount: 500 })
    expect(latestEvent.closingBalance).toEqual({
      amount: SEED_BALANCE.amount + 500,
      availableAmount: SEED_BALANCE.availableAmount + 500
    })

    expect(mockCdpAuditing).toHaveBeenCalledTimes(1)
    expect(
      mockCdpAuditing.mock.calls[0][0].context.previous.status.currentStatus
    ).toBe(PRN_STATUS.ACCEPTED)
    expect(
      mockCdpAuditing.mock.calls[0][0].context.next.status.currentStatus
    ).toBe(PRN_STATUS.CANCELLED)
  })

  it('falls back to email when the admin credential carries no display name', async () => {
    await startServer(buildAcceptedPrn())

    await server.inject({
      method: 'POST',
      url: cancelUrl,
      ...asServiceMaintainerWrite({ email: 'named.maintainer@example.com' })
    })

    const stored = await packagingRecyclingNotesRepository.findById(prnId)
    expect(stored?.status.cancelled?.by.name).toBe(
      'named.maintainer@example.com'
    )
  })

  it('marks the active report for the PRN issuance period stale on accepted -> cancelled', async () => {
    const reportId = randomUUID()
    const reports = new Map([
      [
        reportId,
        {
          ...buildCreateReportParams({ organisationId, registrationId }),
          id: reportId,
          version: 1,
          schemaVersion: 1,
          status: {
            currentStatus: 'in_progress',
            currentStatusAt: new Date().toISOString(),
            created: { at: new Date().toISOString(), by: { id: 'user-1' } },
            history: []
          }
        }
      ]
    ])

    // buildCreateReportParams defaults to January 2024 (DEFAULT_REPORT_YEAR /
    // DEFAULT_REPORT_PERIOD) — the PRN's issued.at must fall in that period for
    // markActiveReportsStaleForPrnCancellation to find this report as active.
    await startServer(
      buildAcceptedPrn({ issuedAt: new Date('2024-01-15T10:00:00Z') }),
      { reports }
    )

    const response = await server.inject({
      method: 'POST',
      url: cancelUrl,
      ...asServiceMaintainerWrite()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)

    const updatedReport = await reportsRepository.findReportById(reportId)
    expect(updatedReport.stale).toEqual({
      prnCancelled: {
        occurredAt: expect.any(String),
        prnId
      }
    })
  })

  it('allows cancellation exactly at the 31 January deadline instant', async () => {
    // Faking only Date leaves setTimeout/setInterval real, so Hapi's own
    // async request lifecycle (server.inject) is unaffected.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2027-01-31T23:59:59.999Z'))

    await startServer(buildAcceptedPrn({ accreditationYear: 2026 }))

    const response = await server.inject({
      method: 'POST',
      url: cancelUrl,
      ...asServiceMaintainerWrite()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    vi.useRealTimers()
  })

  it('rejects cancellation one millisecond after the deadline', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2027-02-01T00:00:00.000Z'))

    await startServer(buildAcceptedPrn({ accreditationYear: 2026 }))

    const response = await server.inject({
      method: 'POST',
      url: cancelUrl,
      ...asServiceMaintainerWrite()
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    const payload = JSON.parse(response.payload)
    expect(payload.message).toMatch(/2026/)
    expect(payload.message).toMatch(/31 January 2027/)

    const stored = await packagingRecyclingNotesRepository.findById(prnId)
    expect(stored?.status.currentStatus).toBe(PRN_STATUS.ACCEPTED)

    await expect(
      ledgerRepository.findLatestInLedger({
        organisationId,
        registrationId,
        accreditationId
      })
    ).resolves.toMatchObject({ kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED })

    vi.useRealTimers()
  })

  it('returns 500 when the accreditation year is missing (fails closed, cannot evaluate the window)', async () => {
    await startServer(
      buildAcceptedPrn({
        accreditationYear: /** @type {number} */ (/** @type {*} */ (null))
      })
    )

    const response = await server.inject({
      method: 'POST',
      url: cancelUrl,
      ...asServiceMaintainerWrite()
    })

    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)

    const stored = await packagingRecyclingNotesRepository.findById(prnId)
    expect(stored?.status.currentStatus).toBe(PRN_STATUS.ACCEPTED)
  })

  it.each([
    PRN_STATUS.DRAFT,
    PRN_STATUS.AWAITING_AUTHORISATION,
    PRN_STATUS.AWAITING_CANCELLATION,
    PRN_STATUS.CANCELLED,
    PRN_STATUS.DELETED,
    PRN_STATUS.DISCARDED
  ])('rejects cancelling a %s PRN', async (currentStatus) => {
    await startServer(buildAcceptedPrn({ currentStatus }))

    const response = await server.inject({
      method: 'POST',
      url: cancelUrl,
      ...asServiceMaintainerWrite()
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)

    const stored = await packagingRecyclingNotesRepository.findById(prnId)
    expect(stored?.status.currentStatus).toBe(currentStatus)
  })

  it('returns 404 for an unknown PRN id', async () => {
    await startServer(null)

    const response = await server.inject({
      method: 'POST',
      url: cancelUrl,
      ...asServiceMaintainerWrite()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('returns 500 and logs when the repository throws an unexpected error', async () => {
    const brokenRepository = {
      findById: vi.fn().mockRejectedValue(new Error('connection reset'))
    }

    server = await createTestServer({
      repositories: {
        packagingRecyclingNotesRepository: () => brokenRepository,
        ledgerRepository: () => createInMemoryLedgerRepository([])(),
        organisationsRepository: () => ({}),
        reportsRepository: () => createInMemoryReportsRepository()()
      },
      featureFlags: createInMemoryFeatureFlags({ prnAdminCancellation: true })
    })

    const response = await server.inject({
      method: 'POST',
      url: cancelUrl,
      ...asServiceMaintainerWrite()
    })

    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
  })

  it('refuses with 409 when the PRN is already cancelled on the stream', async () => {
    await startServer(buildAcceptedPrn())

    // The ticket's second route: the cancel event reached the ledger and the
    // document write did not, so the document still reads accepted.
    await ledgerRepository.appendEvents([
      partialMock(
        buildPrnCancelledAfterIssueEvent({
          organisationId,
          registrationId,
          accreditationId,
          number: 2,
          payload: { prnId, amount: 500 }
        })
      )
    ])

    const response = await server.inject({
      method: 'POST',
      url: cancelUrl,
      ...asServiceMaintainerWrite()
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    const all = await ledgerRepository.findAllInLedger({
      organisationId,
      registrationId,
      accreditationId
    })
    expect(all).toHaveLength(2)
  })

  it('refuses with 409 when another writer takes the ledger slot first', async () => {
    await startServer(buildAcceptedPrn())

    ledgerRepository.appendEvents = vi.fn().mockRejectedValue(
      new LedgerSlotConflictError({
        organisationId,
        registrationId,
        accreditationId,
        number: 2
      })
    )

    const response = await server.inject({
      method: 'POST',
      url: cancelUrl,
      ...asServiceMaintainerWrite()
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    expect(JSON.parse(response.payload).message).not.toContain(accreditationId)
  })

  it('returns 422 for a malformed PRN id (Joi param validation)', async () => {
    await startServer(buildAcceptedPrn())

    const response = await server.inject({
      method: 'POST',
      url: '/v1/admin/packaging-recycling-notes/not-an-object-id/cancel',
      ...asServiceMaintainerWrite()
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('returns 401 with no credentials', async () => {
    await startServer(buildAcceptedPrn())

    const response = await server.inject({ method: 'POST', url: cancelUrl })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })

  it.each([
    ['a read-only service maintainer', asServiceMaintainerRead],
    ['support', asSupport],
    ['an unscoped admin user', asUnscopedAdminUser]
  ])('returns 403 for %s (no admin.write)', async (_label, authAs) => {
    await startServer(buildAcceptedPrn())

    const response = await server.inject({
      method: 'POST',
      url: cancelUrl,
      ...authAs()
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })

  it('404s when the feature flag is off, even for a well-formed request', async () => {
    await startServer(buildAcceptedPrn(), { cancellationEnabled: false })

    const response = await server.inject({
      method: 'POST',
      url: cancelUrl,
      ...asServiceMaintainerWrite()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  describe('cancelling from awaiting_acceptance (PAE-1859)', () => {
    /** @param {Object} [options] */
    const buildAwaitingAcceptancePrn = ({
      accreditationYear = 2026,
      tonnage = 500,
      issuedAt = ISSUED_AT
    } = {}) => {
      const prn = buildAcceptedPrn({
        currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        accreditationYear,
        tonnage,
        issuedAt
      })
      // Never accepted — the accepted slot must stay unset so the external API
      // does not report an acceptedAt for a PRN that was never accepted.
      const { accepted: _accepted, ...statusWithoutAccepted } = prn.status
      return { ...prn, status: statusWithoutAccepted }
    }

    it('cancels an awaiting_acceptance PRN within the window, crediting the full tonnage back', async () => {
      await startServer(buildAwaitingAcceptancePrn({ tonnage: 500 }))

      const response = await server.inject({
        method: 'POST',
        url: cancelUrl,
        ...asServiceMaintainerWrite()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body.status).toBe(PRN_STATUS.CANCELLED)

      const stored = await packagingRecyclingNotesRepository.findById(prnId)
      expect(stored?.status.currentStatus).toBe(PRN_STATUS.CANCELLED)
      // Never accepted or rejected, so neither slot should be stamped by the
      // cancellation — the external API must not report acceptedAt/rejectedAt.
      expect(stored?.status.accepted).toBeUndefined()
      expect(stored?.status.rejected).toBeUndefined()

      const latestEvent = await ledgerRepository.findLatestInLedger({
        organisationId,
        registrationId,
        accreditationId
      })
      expect(latestEvent.kind).toBe(LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE)
      expect(latestEvent.closingBalance).toEqual({
        amount: SEED_BALANCE.amount + 500,
        availableAmount: SEED_BALANCE.availableAmount + 500
      })

      expect(mockCdpAuditing).toHaveBeenCalledTimes(1)
      expect(
        mockCdpAuditing.mock.calls[0][0].context.previous.status.currentStatus
      ).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
      expect(
        mockCdpAuditing.mock.calls[0][0].context.next.status.currentStatus
      ).toBe(PRN_STATUS.CANCELLED)
    })

    it('marks the active report for the PRN issuance period stale on awaiting_acceptance -> cancelled', async () => {
      const reportId = randomUUID()
      const reports = new Map([
        [
          reportId,
          {
            ...buildCreateReportParams({ organisationId, registrationId }),
            id: reportId,
            version: 1,
            schemaVersion: 1,
            status: {
              currentStatus: 'in_progress',
              currentStatusAt: new Date().toISOString(),
              created: { at: new Date().toISOString(), by: { id: 'user-1' } },
              history: []
            }
          }
        ]
      ])

      await startServer(
        buildAwaitingAcceptancePrn({
          issuedAt: new Date('2024-01-15T10:00:00Z')
        }),
        { reports }
      )

      const response = await server.inject({
        method: 'POST',
        url: cancelUrl,
        ...asServiceMaintainerWrite()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const updatedReport = await reportsRepository.findReportById(reportId)
      expect(updatedReport.stale).toEqual({
        prnCancelled: {
          occurredAt: expect.any(String),
          prnId
        }
      })
    })

    it('allows cancellation exactly at the 31 January deadline instant', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2027-01-31T23:59:59.999Z'))

      await startServer(buildAwaitingAcceptancePrn({ accreditationYear: 2026 }))

      const response = await server.inject({
        method: 'POST',
        url: cancelUrl,
        ...asServiceMaintainerWrite()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      vi.useRealTimers()
    })

    it('rejects cancellation one millisecond after the deadline', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2027-02-01T00:00:00.000Z'))

      await startServer(buildAwaitingAcceptancePrn({ accreditationYear: 2026 }))

      const response = await server.inject({
        method: 'POST',
        url: cancelUrl,
        ...asServiceMaintainerWrite()
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      const payload = JSON.parse(response.payload)
      expect(payload.message).toMatch(/2026/)
      expect(payload.message).toMatch(/31 January 2027/)

      const stored = await packagingRecyclingNotesRepository.findById(prnId)
      expect(stored?.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)

      vi.useRealTimers()
    })
  })

  it('rejects a second cancellation of the same PRN, crediting the balance only once', async () => {
    await startServer(buildAcceptedPrn({ tonnage: 500 }))

    const first = await server.inject({
      method: 'POST',
      url: cancelUrl,
      ...asServiceMaintainerWrite()
    })
    expect(first.statusCode).toBe(StatusCodes.OK)

    const second = await server.inject({
      method: 'POST',
      url: cancelUrl,
      ...asServiceMaintainerWrite()
    })
    expect(second.statusCode).toBe(StatusCodes.CONFLICT)

    const latestEvent = await ledgerRepository.findLatestInLedger({
      organisationId,
      registrationId,
      accreditationId
    })
    expect(latestEvent.kind).toBe(LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE)
    expect(latestEvent.closingBalance).toEqual({
      amount: SEED_BALANCE.amount + 500,
      availableAmount: SEED_BALANCE.availableAmount + 500
    })
  })
})
