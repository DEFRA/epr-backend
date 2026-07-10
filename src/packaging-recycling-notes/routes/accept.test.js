import { StatusCodes } from 'http-status-codes'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MATERIAL, REGULATOR } from '#domain/organisations/model.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { config } from '#root/config.js'
import { createMockLogger } from '#test/mock-logger.js'
import { createTestServer } from '#test/create-test-server.js'
import {
  setupAuthContext,
  cognitoJwksUrl
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

const acceptUrl = `/v1/packaging-recycling-notes/${prnNumber}/accept`
const authHeaders = {
  authorization: `Bearer ${generateExternalApiToken(externalApiClientId)}`
}

/**
 * Seeds the ledger's waste balance with a single opening summary-log event.
 * It carries no `prnId`, so the read-side fold leaves the seeded PRN untouched
 * while `findBalance` still resolves a balance for the status-only append.
 */
const openingBalanceEvent = () =>
  buildLedgerEvent({
    registrationId,
    accreditationId,
    organisationId,
    number: 1
  })

let server
let ledgerRepository
let packagingRecyclingNotesRepository

/**
 * Wires a server with real in-memory adapters: a PRN store seeded with the
 * supplied PRN, an event stream seeded with an opening balance, and the
 * waste-balance store reading that stream. Captures the stream and PRN
 * repositories so tests can read state back after a transition.
 *
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null} prn
 */
const startServer = async (prn) => {
  ledgerRepository = createInMemoryLedgerRepository([openingBalanceEvent()])()
  const prnRepositoryFactory = createInMemoryPackagingRecyclingNotesRepository(
    prn ? [prn] : []
  )
  packagingRecyclingNotesRepository = prnRepositoryFactory(createMockLogger())
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
      organisationsRepository: () => ({})
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

describe(`POST /v1/packaging-recycling-notes/{prnNumber}/accept`, () => {
  setupAuthContext()

  afterEach(async () => {
    await server.stop()
    config.reset('packagingRecyclingNotesExternalApi.clientId')
    vi.clearAllMocks()
  })

  it('persists ACCEPTED, appends a balance-neutral PRN_ACCEPTED event attributed to RPD, and audits', async () => {
    await startServer(buildPrn())

    const response = await server.inject({
      method: 'POST',
      url: acceptUrl,
      headers: authHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
    expect(response.payload).toBe('')

    const stored = await packagingRecyclingNotesRepository.findById(prnId)
    expect(stored?.status.currentStatus).toBe(PRN_STATUS.ACCEPTED)
    expect(stored?.updatedBy).toEqual(rpd)
    expect(stored?.status.accepted?.by).toEqual(rpd)

    const latestEvent = await ledgerRepository.findLatestInLedger({
      organisationId,
      registrationId,
      accreditationId
    })
    expect(latestEvent.kind).toBe(LEDGER_EVENT_KIND.PRN_ACCEPTED)
    expect(latestEvent.createdBy).toEqual(rpd)
    // Acceptance is balance-neutral: the closing balance matches the opening one.
    expect(latestEvent.closingBalance).toEqual(latestEvent.openingBalance)

    expect(mockCdpAuditing).toHaveBeenCalledTimes(1)
    expect(mockCdpAuditing.mock.calls[0][0].user).toStrictEqual(
      expect.objectContaining(rpd)
    )
  })

  it('honours a caller-provided acceptedAt timestamp in the payload', async () => {
    await startServer(buildPrn())

    const response = await server.inject({
      method: 'POST',
      url: acceptUrl,
      headers: authHeaders,
      payload: { acceptedAt: '2026-02-01T10:30:00Z' }
    })

    expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
    const stored = await packagingRecyclingNotesRepository.findById(prnId)
    expect(stored?.status.currentStatus).toBe(PRN_STATUS.ACCEPTED)
  })

  it.each([
    PRN_STATUS.ACCEPTED,
    PRN_STATUS.AWAITING_CANCELLATION,
    PRN_STATUS.CANCELLED
  ])('returns 409 when the PRN is already %s', async (currentStatus) => {
    await startServer(buildPrn(currentStatus))

    const response = await server.inject({
      method: 'POST',
      url: acceptUrl,
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
      url: acceptUrl,
      headers: authHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    expect(JSON.parse(response.payload)).toEqual({
      code: 'NOT_FOUND',
      message: `Packaging recycling note not found: ${prnNumber}`
    })
  })

  it('returns 400 with spec error format for an invalid acceptedAt format', async () => {
    await startServer(buildPrn())

    const response = await server.inject({
      method: 'POST',
      url: acceptUrl,
      headers: authHeaders,
      payload: { acceptedAt: 'not-a-date' }
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
    ledgerRepository = createInMemoryLedgerRepository([openingBalanceEvent()])()
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
      url: acceptUrl,
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
