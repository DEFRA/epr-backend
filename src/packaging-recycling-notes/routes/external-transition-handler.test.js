import { describe, it, expect } from 'vitest'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '#waste-balances/domain/model.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryWasteBalancesRepository } from '#waste-balances/repository/inmemory.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createExternalTransitionHandler } from './external-transition-handler.js'

const REG_ID = 'reg-789'
const ACC_ID = 'acc-456'
const ORG_ID = 'org-123'
const PRN_ID = '507f1f77bcf86cd799439011'
const PRN_NUMBER = 'ER2600001'
const baseAt = new Date('2026-01-15T10:00:00.000Z')
const actor = { id: 'rpd', name: 'RPD' }

const noopLogger = () =>
  /** @type {*} */ ({
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    trace: () => {},
    fatal: () => {},
    child: () => {}
  })

/** @param {string} currentStatus */
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
    material: 'plastic',
    submittedToRegulator: 'ea'
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

/** @param {string} kind @param {number} number */
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
  createdAt: new Date('2026-02-01T10:00:00.000Z'),
  createdBy: { id: 'signatory', name: 'Signatory' }
})

/**
 * @param {object} params
 * @param {string} params.currentStatus
 * @param {object[]} [params.events]
 * @param {string} [params.canonicalSource]
 */
const buildRequest = ({
  currentStatus,
  events = [],
  canonicalSource = WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
}) => {
  const streamRepository = createInMemoryStreamRepository(
    /** @type {*} */ (events)
  )()
  return {
    packagingRecyclingNotesRepository:
      createInMemoryPackagingRecyclingNotesRepository([
        buildPrn(currentStatus)
      ])(noopLogger()),
    wasteBalancesRepository: createInMemoryWasteBalancesRepository(
      [
        {
          id: 'wb-1',
          accreditationId: ACC_ID,
          organisationId: ORG_ID,
          amount: 100,
          availableAmount: 100,
          transactions: [],
          version: 0,
          schemaVersion: 1,
          canonicalSource
        }
      ],
      { streamRepository }
    )(),
    organisationsRepository: createInMemoryOrganisationsRepository([])(),
    params: { prnNumber: PRN_NUMBER },
    payload: null,
    logger: noopLogger(),
    auth: { credentials: actor }
  }
}

const h = {
  response: () => ({ code: () => {} })
}

describe('createExternalTransitionHandler', () => {
  it('returns 400 when the actor is not permitted for the transition', () => {
    // AWAITING_CANCELLATION → CANCELLED exists but only for the SIGNATORY
    // actor; the factory always uses PRODUCER, so this is unauthorised.
    const { handler } = createExternalTransitionHandler({
      newStatus: PRN_STATUS.CANCELLED,
      timestampField: 'cancelledAt',
      actionVerb: 'cancelled',
      path: '/test'
    })

    const request = buildRequest({
      currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
    })

    return expect(handler(request, h)).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 400 }
    })
  })

  it('folds the stream tail before validating, rejecting an accept on a PRN the stream has already cancelled', () => {
    // The persisted doc is stale at awaiting_acceptance, but a cancel event in
    // the ledger stream means the PRN is really cancelled. Folding on read puts
    // the transition decision on the true status instead of the stale doc.
    const { handler } = createExternalTransitionHandler({
      newStatus: PRN_STATUS.ACCEPTED,
      timestampField: 'acceptedAt',
      actionVerb: 'accepted',
      path: '/test'
    })

    const request = buildRequest({
      currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      events: [buildEvent(STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE, 1)]
    })

    return expect(handler(request, h)).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 409 }
    })
  })
})
