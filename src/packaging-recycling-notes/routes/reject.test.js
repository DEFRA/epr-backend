import { StatusCodes } from 'http-status-codes'
import { randomUUID } from 'node:crypto'
import { ObjectId } from 'mongodb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MATERIAL, REGULATOR } from '#domain/organisations/model.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { config } from '#root/config.js'
import { createMockLogger } from '#test/mock-logger.js'
import { createTestServer } from '#test/create-test-server.js'
import { partialMock } from '#test/type-helpers.js'
import {
  cognitoJwksUrl,
  setupAuthContext
} from '#vite/helpers/setup-auth-mocking.js'
import { generateExternalApiToken } from './test-helpers.js'

/** @import { PackagingRecyclingNote, PrnStatus } from '#packaging-recycling-notes/domain/model.js' */

const mockCdpAuditing = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockCdpAuditing(...args)
}))

const prnId = '507f1f77bcf86cd799439011'
const prnNumber = 'ER2600001'
const registrationId = 'reg-456'
const accreditationId = 'acc-789'
const organisationId = 'org-123'
const externalApiClientId = randomUUID()
const rpd = { id: externalApiClientId, name: 'RPD' }

const rejectUrl = `/v1/packaging-recycling-notes/${prnNumber}/reject`
const authHeaders = {
  authorization: `Bearer ${generateExternalApiToken(externalApiClientId)}`
}

/**
 * Seeds the ledger's waste balance with a single opening summary-log event.
 * It carries no `prnId`, so the read-side fold leaves the seeded PRN untouched
 * while `findBalance` still resolves a balance for the status-only append.
 */
const openingBalanceEvent = (
  ledgerIds = { registrationId, accreditationId, organisationId }
) =>
  buildLedgerEvent({
    ...ledgerIds,
    number: 1
  })

let server
let ledgerRepository
let packagingRecyclingNotesRepository
let reportsRepository

/**
 * Wires a server with real in-memory adapters: a PRN store seeded with the
 * supplied PRN, an event stream seeded with an opening balance, the
 * waste-balance store reading that stream, and a reports store seeded with
 * `reports`. Captures the stream, PRN and reports repositories so tests can
 * read state back after a transition.
 *
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null} prn
 * @param {Object} [options]
 * @param {Map<string, object>} [options.reports]
 * @param {{ registrationId: string, accreditationId: string, organisationId: string }} [options.ledgerIds]
 */
const startServer = async (prn, { reports = new Map(), ledgerIds } = {}) => {
  ledgerRepository = createInMemoryLedgerRepository([
    partialMock(openingBalanceEvent(ledgerIds))
  ])()
  const prnRepositoryFactory = createInMemoryPackagingRecyclingNotesRepository(
    prn ? [prn] : []
  )
  packagingRecyclingNotesRepository = prnRepositoryFactory(createMockLogger())
  const reportsRepositoryFactory = createInMemoryReportsRepository(reports)
  reportsRepository = reportsRepositoryFactory()
  server = await createTestServer({
    config: {
      packagingRecyclingNotesExternalApi: {
        clientId: externalApiClientId,
        jwksUrl: cognitoJwksUrl
      }
    },
    repositories: {
      packagingRecyclingNotesRepository: prnRepositoryFactory,
      ledgerRepository: () => ledgerRepository,
      organisationsRepository: () => ({}),
      reportsRepository: reportsRepositoryFactory
    },
    featureFlags: createInMemoryFeatureFlags()
  })
  return server
}

/**
 * Builds an issued PRN seeded at the given status.
 *
 * @param {PrnStatus} [currentStatus]
 * @returns {PackagingRecyclingNote}
 */
const buildPrn = (currentStatus = PRN_STATUS.AWAITING_ACCEPTANCE) => ({
  id: prnId,
  schemaVersion: 2,
  version: 1,
  prnNumber,
  organisation: { id: organisationId, name: 'Test Organisation' },
  registrationId,
  accreditation: {
    id: accreditationId,
    accreditationNumber: 'ACC-2026-001',
    accreditationYear: 2026,
    material: MATERIAL.PLASTIC,
    submittedToRegulator: REGULATOR.EA
  },
  issuedToOrganisation: { id: 'producer-org-789', name: 'Producer Org' },
  tonnage: 100,
  isExport: false,
  isDecemberWaste: false,
  createdAt: new Date('2026-01-10T10:00:00Z'),
  createdBy: { id: 'user-123', name: 'Test User' },
  updatedAt: new Date('2026-01-15T10:00:00Z'),
  updatedBy: { id: 'user-issuer', name: 'Issuer User' },
  status: {
    currentStatus,
    currentStatusAt: new Date('2026-01-15T10:00:00Z'),
    history: []
  }
})

const ISSUED_AT = new Date('2024-01-15T10:00:00Z')

/**
 * Builds a PRN with a `status.issued` slot, the state a real
 * AWAITING_ACCEPTANCE PRN carries once actually issued — the trigger
 * condition for the report-staleness side effect on reject.
 *
 * @returns {PackagingRecyclingNote}
 */
const buildIssuedPrn = () => {
  const prn = buildPrn()
  return {
    ...prn,
    status: {
      ...prn.status,
      issued: { at: ISSUED_AT, by: { id: 'user-issuer', name: 'Issuer User' } }
    }
  }
}

describe(`POST /v1/packaging-recycling-notes/{prnNumber}/reject`, () => {
  setupAuthContext()

  afterEach(async () => {
    await server.stop()
    config.reset('packagingRecyclingNotesExternalApi.clientId')
    vi.clearAllMocks()
  })

  it('persists AWAITING_CANCELLATION, appends a balance-neutral PRN_REJECTED event attributed to RPD, and audits', async () => {
    const testOrgId = new ObjectId().toString()
    const testRegId = new ObjectId().toString()
    const testAccId = new ObjectId().toString()

    const issuedPrn = {
      ...buildIssuedPrn(),
      organisation: { id: testOrgId, name: 'Test Organisation' },
      registrationId: testRegId,
      accreditation: {
        ...buildIssuedPrn().accreditation,
        id: testAccId
      }
    }

    await startServer(issuedPrn, {
      ledgerIds: {
        registrationId: testRegId,
        accreditationId: testAccId,
        organisationId: testOrgId
      }
    })

    const response = await server.inject({
      method: 'POST',
      url: rejectUrl,
      headers: authHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
    expect(response.payload).toBe('')

    const stored = await packagingRecyclingNotesRepository.findById(prnId)
    expect(stored?.status.currentStatus).toBe(PRN_STATUS.AWAITING_CANCELLATION)
    expect(stored?.updatedBy).toEqual(rpd)
    expect(stored?.status.rejected?.by).toEqual(rpd)

    const latestEvent = await ledgerRepository.findLatestInLedger({
      organisationId: testOrgId,
      registrationId: testRegId,
      accreditationId: testAccId
    })
    expect(latestEvent.kind).toBe(LEDGER_EVENT_KIND.PRN_REJECTED)
    expect(latestEvent.createdBy).toEqual(rpd)
    // Rejection is balance-neutral: the closing balance matches the opening one.
    expect(latestEvent.closingBalance).toEqual(latestEvent.openingBalance)

    expect(mockCdpAuditing).toHaveBeenCalledTimes(1)
    expect(mockCdpAuditing.mock.calls[0][0].user).toStrictEqual(
      expect.objectContaining(rpd)
    )
  })

  it('marks the active report for the PRN issuance period stale when the PRN was issued', async () => {
    const staleTestOrgId = new ObjectId().toString()
    const staleTestRegId = new ObjectId().toString()
    const staleTestAccId = new ObjectId().toString()

    const issuedPrn = {
      ...buildIssuedPrn(),
      organisation: { id: staleTestOrgId, name: 'Test Organisation' },
      registrationId: staleTestRegId,
      accreditation: {
        ...buildIssuedPrn().accreditation,
        id: staleTestAccId
      }
    }

    const reportId = randomUUID()
    const reports = new Map([
      [
        reportId,
        {
          ...buildCreateReportParams({
            organisationId: staleTestOrgId,
            registrationId: staleTestRegId
          }),
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

    await startServer(issuedPrn, {
      reports,
      ledgerIds: {
        registrationId: staleTestRegId,
        accreditationId: staleTestAccId,
        organisationId: staleTestOrgId
      }
    })

    const response = await server.inject({
      method: 'POST',
      url: rejectUrl,
      headers: authHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)

    const updatedReport = await reportsRepository.findReportById(reportId)
    expect(updatedReport.stale).toEqual({
      prnCancelled: {
        occurredAt: expect.any(String),
        prnId
      }
    })
  })

  it.each([
    PRN_STATUS.ACCEPTED,
    PRN_STATUS.AWAITING_CANCELLATION,
    PRN_STATUS.CANCELLED,
    PRN_STATUS.DRAFT
  ])('returns 409 when the PRN is %s', async (currentStatus) => {
    await startServer(buildPrn(currentStatus))

    const response = await server.inject({
      method: 'POST',
      url: rejectUrl,
      headers: authHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    const payload = JSON.parse(response.payload)
    expect(payload.code).toBe('CONFLICT')
    expect(payload.message).toEqual(expect.any(String))
    expect(Object.keys(payload)).toEqual(['code', 'message'])
  })

  it('returns 404 with spec error format when the PRN does not exist', async () => {
    await startServer(null)

    const response = await server.inject({
      method: 'POST',
      url: rejectUrl,
      headers: authHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    expect(JSON.parse(response.payload)).toEqual({
      code: 'NOT_FOUND',
      message: `Packaging recycling note not found: ${prnNumber}`
    })
  })

  it('returns 400 with spec error format for an invalid rejectedAt format', async () => {
    await startServer(buildPrn())

    const response = await server.inject({
      method: 'POST',
      url: rejectUrl,
      headers: authHeaders,
      payload: { rejectedAt: 'not-a-date' }
    })

    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    const payload = JSON.parse(response.payload)
    expect(payload.code).toBe('BAD_REQUEST')
    expect(payload.message).toEqual(expect.any(String))
    expect(Object.keys(payload)).toEqual(['code', 'message'])
  })

  it('returns 500 with spec error format when the repository throws unexpectedly', async () => {
    // No in-memory adapter can simulate an infrastructure failure, so an
    // unexpected throw is injected directly to drive the handler's 500 mapping.
    ledgerRepository = createInMemoryLedgerRepository([
      partialMock(openingBalanceEvent())
    ])()
    server = await createTestServer({
      config: {
        packagingRecyclingNotesExternalApi: {
          clientId: externalApiClientId,
          jwksUrl: cognitoJwksUrl
        }
      },
      repositories: {
        packagingRecyclingNotesRepository: () => ({
          findByPrnNumber: async () => {
            throw new Error('Database connection lost')
          }
        }),
        organisationsRepository: () => ({})
      },
      featureFlags: createInMemoryFeatureFlags()
    })

    const response = await server.inject({
      method: 'POST',
      url: rejectUrl,
      headers: authHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    expect(JSON.parse(response.payload)).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An internal server error occurred'
    })
    expect(server.loggerMocks.error).toHaveBeenCalled()
  })
})
