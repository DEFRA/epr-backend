import { StatusCodes } from 'http-status-codes'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MATERIAL, REGULATOR } from '#domain/organisations/model.js'
import {
  PRN_ACTOR,
  PRN_STATUS,
  UnauthorisedTransitionError
} from '#packaging-recycling-notes/domain/model.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { config } from '#root/config.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { partialMock } from '#test/type-helpers.js'
import {
  setupAuthContext,
  cognitoJwksUrl
} from '#vite/helpers/setup-auth-mocking.js'
import { generateExternalApiToken } from './test-helpers.js'
import { mapTransitionError } from './external-transition-handler.js'

/**
 * @import { PackagingRecyclingNote, PrnStatus } from '#packaging-recycling-notes/domain/model.js'
 * @import { LedgerEvent, LedgerEventKind } from '#waste-balances/repository/ledger-schema.js'
 */

const mockCdpAuditing = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockCdpAuditing(...args)
}))

const REG_ID = 'reg-789'
const ACC_ID = 'acc-456'
const ORG_ID = 'org-123'
const PRN_ID = '507f1f77bcf86cd799439011'
const PRN_NUMBER = 'ER2600001'
const baseAt = new Date('2026-01-15T10:00:00.000Z')
const eventAt = new Date('2026-02-01T10:00:00.000Z')
const actor = { id: 'creator', name: 'Creator' }

const externalApiClientId = randomUUID()
const acceptUrl = `/v1/packaging-recycling-notes/${PRN_NUMBER}/accept`
const authHeaders = {
  authorization: `Bearer ${generateExternalApiToken(externalApiClientId)}`
}

/**
 * @param {PrnStatus} currentStatus
 * @returns {PackagingRecyclingNote}
 */
const buildPrn = (currentStatus) => ({
  id: PRN_ID,
  schemaVersion: 2,
  prnNumber: PRN_NUMBER,
  registrationId: REG_ID,
  organisation: { id: ORG_ID, name: 'Test Reprocessor' },
  accreditation: {
    id: ACC_ID,
    accreditationNumber: 'ACC-1',
    accreditationYear: 2026,
    material: MATERIAL.PLASTIC,
    submittedToRegulator: REGULATOR.EA
  },
  issuedToOrganisation: { id: 'producer-1', name: 'Producer Org' },
  tonnage: 50,
  isExport: false,
  isDecemberWaste: false,
  version: 1,
  createdAt: baseAt,
  createdBy: actor,
  updatedAt: baseAt,
  updatedBy: actor,
  status: { currentStatus, currentStatusAt: baseAt, history: [] }
})

/**
 * @param {LedgerEventKind} kind
 * @param {number} number
 * @returns {LedgerEvent}
 */
const buildEvent = (kind, number) => ({
  id: `event-${number}`,
  registrationId: REG_ID,
  accreditationId: ACC_ID,
  organisationId: ORG_ID,
  number,
  kind,
  payload: { prnId: PRN_ID, amount: 50 },
  openingBalance: { amount: 100, availableAmount: 100 },
  closingBalance: { amount: 100, availableAmount: 50 },
  createdAt: eventAt,
  createdBy: { id: 'signatory', name: 'Signatory' }
})

let server
let ledgerRepository

/**
 * Starts a test server wired with real in-memory adapters: the PRN store, the
 * event stream, and the waste-balance store sharing that stream. The read-side
 * fold always runs, bringing the persisted doc current from the stream tail
 * before the transition decision.
 *
 * @param {object} params
 * @param {PrnStatus} params.currentStatus
 * @param {LedgerEvent[]} params.events
 */
const startServer = async ({ currentStatus, events }) => {
  ledgerRepository = createInMemoryLedgerRepository(events)()
  server = await createTestServer({
    config: {
      packagingRecyclingNotesExternalApi: {
        clientId: externalApiClientId,
        jwksUrl: cognitoJwksUrl
      }
    },
    repositories: {
      packagingRecyclingNotesRepository:
        createInMemoryPackagingRecyclingNotesRepository([
          buildPrn(currentStatus)
        ]),
      ledgerRepository: () => ledgerRepository,
      organisationsRepository: () => ({})
    },
    featureFlags: createInMemoryFeatureFlags()
  })
  return server
}

describe('external PRN transition read-side fold', () => {
  setupAuthContext()

  afterEach(async () => {
    await server.stop()
    config.reset('packagingRecyclingNotesExternalApi.clientId')
  })

  it('rejects an accept on a ledger PRN the stream has already cancelled', async () => {
    // The persisted doc is stale at awaiting_acceptance, but a cancel event in
    // the ledger stream means the PRN is really cancelled. Folding on read puts
    // the transition decision on the true status, so the accept conflicts.
    await startServer({
      currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      events: [buildEvent(LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE, 1)]
    })

    const response = await server.inject({
      method: 'POST',
      url: acceptUrl,
      headers: authHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
  })

  it('attributes a live RPD accept to the RPD service with no email', async () => {
    await startServer({
      currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      events: [
        partialMock(
          buildLedgerEvent({
            registrationId: REG_ID,
            accreditationId: ACC_ID,
            organisationId: ORG_ID,
            number: 1
          })
        )
      ]
    })

    const response = await server.inject({
      method: 'POST',
      url: acceptUrl,
      headers: authHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)

    const latest = await ledgerRepository.findLatestInLedger({
      organisationId: ORG_ID,
      registrationId: REG_ID,
      accreditationId: ACC_ID
    })
    expect(latest.kind).toBe(LEDGER_EVENT_KIND.PRN_ACCEPTED)
    expect(latest.createdBy).toEqual({
      id: externalApiClientId,
      name: 'RPD'
    })
  })
})

describe('mapTransitionError', () => {
  // Both wired external routes (accept, reject) drive PRODUCER-only transitions,
  // so a wrong-actor error never arises through them. The mapping is exercised
  // here directly to keep the generic handler's 400 path verified.
  it('maps an unauthorised transition to a 400', () => {
    const error = new UnauthorisedTransitionError(
      PRN_STATUS.AWAITING_CANCELLATION,
      PRN_STATUS.CANCELLED,
      PRN_ACTOR.PRODUCER
    )

    const result = mapTransitionError(error, '/test', { error: () => {} })

    expect(result.isBoom).toBe(true)
    expect(result.output.statusCode).toBe(StatusCodes.BAD_REQUEST)
  })
})
