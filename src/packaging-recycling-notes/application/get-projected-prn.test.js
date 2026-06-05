import { describe, it, expect } from 'vitest'

import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryWasteBalancesRepository } from '#waste-balances/repository/inmemory.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import {
  getProjectedPrnById,
  getProjectedPrnByNumber
} from './get-projected-prn.js'

/**
 * @import { PackagingRecyclingNote } from '#packaging-recycling-notes/domain/model.js'
 * @import { StreamEvent, StreamEventKind } from '#waste-balances/repository/stream-schema.js'
 */

const REG_ID = 'reg-789'
const ACC_ID = 'acc-456'
const ORG_ID = 'org-123'
const PRN_ID = '507f1f77bcf86cd799439011'
const PRN_NUMBER = 'ER2600001'
const baseAt = new Date('2026-01-15T10:00:00.000Z')
const creator = { id: 'creator', name: 'Original Creator' }
const eventActor = { id: 'user-1', name: 'Test User' }

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

/**
 * @param {Partial<PackagingRecyclingNote>} [overrides]
 * @returns {PackagingRecyclingNote}
 */
const buildPrn = (overrides = {}) => ({
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
  createdBy: creator,
  updatedAt: baseAt,
  updatedBy: creator,
  status: {
    currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
    currentStatusAt: baseAt,
    history: []
  },
  ...overrides
})

/**
 * @param {StreamEventKind} kind
 * @param {number} number
 * @param {string} createdAt
 * @returns {StreamEvent}
 */
const buildEvent = (kind, number, createdAt) => ({
  id: `event-${number}`,
  registrationId: REG_ID,
  accreditationId: ACC_ID,
  organisationId: ORG_ID,
  number,
  kind,
  payload: { prnId: PRN_ID, amount: 50 },
  openingBalance: { amount: 100, availableAmount: 100 },
  closingBalance: { amount: 100, availableAmount: 50 },
  createdAt: new Date(createdAt),
  createdBy: eventActor
})

const buildBalance = () => ({
  id: 'wb-1',
  accreditationId: ACC_ID,
  registrationId: REG_ID,
  organisationId: ORG_ID,
  amount: 100,
  availableAmount: 100,
  version: 0,
  schemaVersion: 1
})

/**
 * Assembles the real in-memory adapters: the PRN store, the event stream, and
 * the waste-balance store that shares that stream. Catch-up events past the
 * PRN's watermark are always folded onto the read.
 *
 * @param {object} params
 * @param {PackagingRecyclingNote | null} [params.prn]
 * @param {StreamEvent[]} [params.events]
 */
const buildRepositories = ({ prn = null, events = [] }) => {
  const packagingRecyclingNotesRepository =
    createInMemoryPackagingRecyclingNotesRepository(prn ? [prn] : [])(
      noopLogger()
    )
  const streamRepository = createInMemoryStreamRepository(events)()
  const wasteBalancesRepository = createInMemoryWasteBalancesRepository(
    [buildBalance()],
    { streamRepository }
  )()
  return { packagingRecyclingNotesRepository, wasteBalancesRepository }
}

describe('getProjectedPrnById', () => {
  it('folds tail events past the watermark onto the PRN', async () => {
    const { packagingRecyclingNotesRepository, wasteBalancesRepository } =
      buildRepositories({
        prn: buildPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            currentStatusAt: baseAt,
            history: []
          }
        }),
        events: [
          buildEvent(
            STREAM_EVENT_KIND.PRN_ISSUED,
            1,
            '2026-02-02T12:00:00.000Z'
          )
        ]
      })

    const result = await getProjectedPrnById({
      packagingRecyclingNotesRepository,
      wasteBalancesRepository,
      prnId: PRN_ID
    })

    expect(result?.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
    expect(result?.lastAppliedEventNumber).toBe(1)
  })

  it('ignores events at or before the watermark', async () => {
    const { packagingRecyclingNotesRepository, wasteBalancesRepository } =
      buildRepositories({
        prn: buildPrn({ version: 1, lastAppliedEventNumber: 1 }),
        events: [
          buildEvent(
            STREAM_EVENT_KIND.PRN_ISSUED,
            1,
            '2026-02-01T12:00:00.000Z'
          ),
          buildEvent(
            STREAM_EVENT_KIND.PRN_ACCEPTED,
            2,
            '2026-02-02T12:00:00.000Z'
          )
        ]
      })

    const result = await getProjectedPrnById({
      packagingRecyclingNotesRepository,
      wasteBalancesRepository,
      prnId: PRN_ID
    })

    // Only event 2 is folded (event 1 is at the watermark): status and the
    // watermark advance, but version stays with the stored document.
    expect(result?.status.currentStatus).toBe(PRN_STATUS.ACCEPTED)
    expect(result?.lastAppliedEventNumber).toBe(2)
    expect(result?.version).toBe(1)
  })

  it('returns the PRN unchanged when the ledger stream has no later events', async () => {
    const prn = buildPrn({ lastAppliedEventNumber: 3 })
    const { packagingRecyclingNotesRepository, wasteBalancesRepository } =
      buildRepositories({ prn })

    const result = await getProjectedPrnById({
      packagingRecyclingNotesRepository,
      wasteBalancesRepository,
      prnId: PRN_ID
    })

    expect(result?.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
    expect(result?.version).toBe(1)
  })

  it('returns null when the PRN does not exist', async () => {
    const { packagingRecyclingNotesRepository, wasteBalancesRepository } =
      buildRepositories({ prn: null })

    const result = await getProjectedPrnById({
      packagingRecyclingNotesRepository,
      wasteBalancesRepository,
      prnId: PRN_ID
    })

    expect(result).toBeNull()
  })

  it('returns a soft-deleted PRN as-is without folding', async () => {
    const { packagingRecyclingNotesRepository, wasteBalancesRepository } =
      buildRepositories({
        prn: buildPrn({
          status: {
            currentStatus: PRN_STATUS.DELETED,
            currentStatusAt: baseAt,
            history: []
          }
        }),
        events: [
          buildEvent(
            STREAM_EVENT_KIND.PRN_ISSUED,
            1,
            '2026-02-02T12:00:00.000Z'
          )
        ]
      })

    const result = await getProjectedPrnById({
      packagingRecyclingNotesRepository,
      wasteBalancesRepository,
      prnId: PRN_ID
    })

    expect(result?.status.currentStatus).toBe(PRN_STATUS.DELETED)
    expect(result?.version).toBe(1)
  })
})

describe('getProjectedPrnByNumber', () => {
  it('folds the stream tail onto the PRN found by number', async () => {
    const { packagingRecyclingNotesRepository, wasteBalancesRepository } =
      buildRepositories({
        prn: buildPrn(),
        events: [
          buildEvent(
            STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
            1,
            '2026-02-02T12:00:00.000Z'
          )
        ]
      })

    const result = await getProjectedPrnByNumber({
      packagingRecyclingNotesRepository,
      wasteBalancesRepository,
      prnNumber: PRN_NUMBER
    })

    expect(result?.status.currentStatus).toBe(PRN_STATUS.CANCELLED)
  })

  it('returns null when no PRN matches the number', async () => {
    const { packagingRecyclingNotesRepository, wasteBalancesRepository } =
      buildRepositories({ prn: null })

    const result = await getProjectedPrnByNumber({
      packagingRecyclingNotesRepository,
      wasteBalancesRepository,
      prnNumber: 'NONEXISTENT'
    })

    expect(result).toBeNull()
  })
})
