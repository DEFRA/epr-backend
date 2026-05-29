import { describe, it, expect, vi } from 'vitest'

import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { getProjectedPrnById } from './get-projected-prn.js'

/**
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 * @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository
 * @typedef {import('#waste-balances/repository/port.js').WasteBalancesRepository} WasteBalancesRepository
 */

const baseUpdatedAt = new Date('2026-01-15T10:00:00.000Z')
const baseCreator = { id: 'creator', name: 'Original Creator' }

/**
 * @param {Partial<PackagingRecyclingNote>} [overrides]
 * @returns {PackagingRecyclingNote}
 */
const buildPrn = (overrides = {}) =>
  /** @type {PackagingRecyclingNote} */ (
    /** @type {unknown} */ ({
      id: 'prn-1',
      registrationId: 'reg-1',
      accreditation: { id: 'acc-1' },
      organisation: { id: 'org-1' },
      version: 1,
      updatedAt: baseUpdatedAt,
      updatedBy: baseCreator,
      status: {
        currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        currentStatusAt: baseUpdatedAt,
        history: []
      },
      ...overrides
    })
  )

const eventCreator = { id: 'user-1', name: 'Test User' }

const buildEvent = (kind, number, createdAt) => ({
  id: `event-${number}`,
  registrationId: 'reg-1',
  accreditationId: 'acc-1',
  organisationId: 'org-1',
  number,
  kind,
  payload: { prnId: 'prn-1', amount: 50 },
  openingBalance: { amount: 100, availableAmount: 100 },
  closingBalance: { amount: 100, availableAmount: 50 },
  createdAt: new Date(createdAt),
  createdBy: eventCreator
})

/**
 * @param {{ findById: import('vitest').Mock }} repo
 * @returns {PackagingRecyclingNotesRepository}
 */
const asPrnRepo = (repo) =>
  /** @type {PackagingRecyclingNotesRepository} */ (
    /** @type {unknown} */ (repo)
  )

/**
 * @param {{ getPrnCatchupEvents: import('vitest').Mock }} repo
 * @returns {WasteBalancesRepository}
 */
const asWasteRepo = (repo) =>
  /** @type {WasteBalancesRepository} */ (/** @type {unknown} */ (repo))

/**
 * @param {{ prn?: PackagingRecyclingNote | null, tailEvents?: object[] }} setup
 */
const setupRepositories = ({ prn = null, tailEvents = [] }) => ({
  prnRepository: { findById: vi.fn(async () => prn) },
  wasteBalancesRepository: {
    getPrnCatchupEvents: vi.fn(async () => tailEvents)
  }
})

describe('getProjectedPrnById', () => {
  it('folds tail events onto the PRN and returns the projected note', async () => {
    const prn = buildPrn({ lastAppliedEventNumber: 1 })
    const { prnRepository, wasteBalancesRepository } = setupRepositories({
      prn,
      tailEvents: [
        buildEvent(STREAM_EVENT_KIND.PRN_ISSUED, 2, '2026-02-02T12:00:00.000Z')
      ]
    })

    const result = await getProjectedPrnById({
      packagingRecyclingNotesRepository: asPrnRepo(prnRepository),
      wasteBalancesRepository: asWasteRepo(wasteBalancesRepository),
      prnId: 'prn-1'
    })

    expect(result?.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
  })

  it('queries catch-up events using the PRN watermark', async () => {
    const prn = buildPrn({ lastAppliedEventNumber: 3 })
    const { prnRepository, wasteBalancesRepository } = setupRepositories({
      prn
    })

    await getProjectedPrnById({
      packagingRecyclingNotesRepository: asPrnRepo(prnRepository),
      wasteBalancesRepository: asWasteRepo(wasteBalancesRepository),
      prnId: 'prn-1'
    })

    expect(wasteBalancesRepository.getPrnCatchupEvents).toHaveBeenCalledWith({
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      prnId: 'prn-1',
      afterEventNumber: 3
    })
  })

  it('defaults afterEventNumber to 0 when the PRN has no watermark', async () => {
    const prn = buildPrn()
    const { prnRepository, wasteBalancesRepository } = setupRepositories({
      prn
    })

    await getProjectedPrnById({
      packagingRecyclingNotesRepository: asPrnRepo(prnRepository),
      wasteBalancesRepository: asWasteRepo(wasteBalancesRepository),
      prnId: 'prn-1'
    })

    expect(wasteBalancesRepository.getPrnCatchupEvents).toHaveBeenCalledWith(
      expect.objectContaining({ afterEventNumber: 0 })
    )
  })

  it('returns the PRN unchanged when no tail events exist', async () => {
    const prn = buildPrn({ lastAppliedEventNumber: 2 })
    const { prnRepository, wasteBalancesRepository } = setupRepositories({
      prn,
      tailEvents: []
    })

    const result = await getProjectedPrnById({
      packagingRecyclingNotesRepository: asPrnRepo(prnRepository),
      wasteBalancesRepository: asWasteRepo(wasteBalancesRepository),
      prnId: 'prn-1'
    })

    expect(result).toBe(prn)
  })

  it('returns null without querying the stream when the PRN does not exist', async () => {
    const { prnRepository, wasteBalancesRepository } = setupRepositories({
      prn: null
    })

    const result = await getProjectedPrnById({
      packagingRecyclingNotesRepository: asPrnRepo(prnRepository),
      wasteBalancesRepository: asWasteRepo(wasteBalancesRepository),
      prnId: 'prn-1'
    })

    expect(result).toBeNull()
    expect(wasteBalancesRepository.getPrnCatchupEvents).not.toHaveBeenCalled()
  })

  it('returns a soft-deleted PRN as-is without querying the stream', async () => {
    const deletedPrn = buildPrn({
      status: {
        currentStatus: PRN_STATUS.DELETED,
        currentStatusAt: baseUpdatedAt,
        history: []
      }
    })
    const { prnRepository, wasteBalancesRepository } = setupRepositories({
      prn: deletedPrn
    })

    const result = await getProjectedPrnById({
      packagingRecyclingNotesRepository: asPrnRepo(prnRepository),
      wasteBalancesRepository: asWasteRepo(wasteBalancesRepository),
      prnId: 'prn-1'
    })

    expect(result).toBe(deletedPrn)
    expect(wasteBalancesRepository.getPrnCatchupEvents).not.toHaveBeenCalled()
  })
})
