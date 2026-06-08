import { describe, it, expect, vi } from 'vitest'

import {
  PRN_STATUS,
  PRN_ACTOR
} from '#packaging-recycling-notes/domain/model.js'
import { REGULATOR } from '#domain/organisations/model.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryWasteBalancesRepository } from '#waste-balances/repository/inmemory.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import { StreamSlotConflictError } from '#waste-balances/repository/stream-port.js'
import {
  buildAwaitingAuthorisationPrn,
  buildAwaitingAcceptancePrn
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'

vi.mock('./metrics.js', () => ({
  prnMetrics: {
    recordStatusTransition: vi.fn().mockResolvedValue(undefined)
  }
}))

const { updatePrnStatus: updatePrnStatusUntyped } =
  await import('./update-status.js')
const updatePrnStatus =
  /** @type {typeof import('./update-status.js').updatePrnStatus} */ (
    updatePrnStatusUntyped
  )

const noopLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn()
})

const PRN_ID = '507f1f77bcf86cd799439011'
const ORG_ID = 'org-123'
const ACC_ID = 'acc-456'
const REG_ID = 'reg-789'
const TONNAGE = 50
const RINGFENCED_AVAILABLE = 950
const ISSUED_AMOUNT = 950

/** @type {Partial<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>} */
const PRN_BASE = {
  id: PRN_ID,
  organisation: {
    id: ORG_ID,
    name: 'Test Reprocessor',
    tradingName: 'Trading Name'
  },
  accreditation: {
    id: ACC_ID,
    accreditationNumber: 'ACC-1',
    accreditationYear: 2026,
    material: 'plastic',
    submittedToRegulator: REGULATOR.EA,
    siteAddress: { line1: '1 Test Street', postcode: 'SW1A 1AA' }
  },
  tonnage: TONNAGE
}

const buildIssuableSeed = () =>
  /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} */ (
    buildAwaitingAuthorisationPrn(PRN_BASE)
  )
const buildAwaitingCancellationSeed = () =>
  /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} */ (
    buildAwaitingAcceptancePrn({
      ...PRN_BASE,
      status:
        /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote['status']} */ ({
          currentStatus: PRN_STATUS.AWAITING_CANCELLATION
        })
    })
  )

const STARTING_TOTAL = 1000

const buildBalanceSeed = (overrides = {}) => ({
  id: 'wb-1',
  accreditationId: ACC_ID,
  registrationId: REG_ID,
  organisationId: ORG_ID,
  amount: STARTING_TOTAL,
  availableAmount: STARTING_TOTAL,
  version: 0,
  schemaVersion: 1,
  ...overrides
})

/**
 * Seed the stream so the seeded balance resolves to its `amount` /
 * `availableAmount` on read.
 *
 * @param {import('#waste-balances/repository/stream-port.js').WasteBalanceStreamRepository} streamRepository
 * @param {{ amount: number, availableAmount: number }} balanceSeed
 */
const seedClosingBalance = (streamRepository, balanceSeed) =>
  streamRepository.appendEvent(
    buildStreamEvent({
      registrationId: REG_ID,
      accreditationId: ACC_ID,
      organisationId: ORG_ID,
      number: 1,
      closingBalance: {
        amount: balanceSeed.amount,
        availableAmount: balanceSeed.availableAmount
      }
    })
  )

const buildOrganisationsRepository = () =>
  /** @type {import('#repositories/organisations/port.js').OrganisationsRepository} */ (
    /** @type {unknown} */ ({
      findAccreditationById: vi.fn().mockResolvedValue({
        submittedToRegulator: REGULATOR.EA
      })
    })
  )

const COMMITTED_EVENT_NUMBER = 2

/**
 * On the ledger path concurrent writers serialise at the append-only stream
 * slot: the first writer claims the next slot, the second collides with a
 * StreamSlotConflictError. Exactly one writer commits, so the stream holds a
 * single event past the seed.
 *
 * @param {PromiseSettledResult<unknown>[]} results
 * @param {import('#waste-balances/repository/stream-port.js').WasteBalanceStreamRepository} streamRepository
 */
const expectOneWinsOneStreamConflict = async (results, streamRepository) => {
  const fulfilled = results.filter((r) => r.status === 'fulfilled')
  const rejected = results.filter((r) => r.status === 'rejected')

  expect(fulfilled).toHaveLength(1)
  expect(rejected).toHaveLength(1)
  expect(rejected[0].reason).toBeInstanceOf(StreamSlotConflictError)

  const latest = await streamRepository.findLatestByPartition(REG_ID, ACC_ID)
  expect(latest?.number).toBe(COMMITTED_EVENT_NUMBER)
}

describe('updatePrnStatus concurrency', () => {
  it('debits the waste balance only once when two issuances race for the same PRN', async () => {
    const prnFactory = createInMemoryPackagingRecyclingNotesRepository([
      buildIssuableSeed()
    ])
    const prnRepository = prnFactory(noopLogger())

    const balanceSeed = buildBalanceSeed()
    const streamRepository = createInMemoryStreamRepository()()
    await seedClosingBalance(streamRepository, balanceSeed)
    const wasteFactory = createInMemoryWasteBalancesRepository([balanceSeed], {
      streamRepository
    })
    const wasteBalancesRepository = wasteFactory()

    const organisationsRepository = buildOrganisationsRepository()

    const issue = () =>
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository,
        logger: noopLogger(),
        id: PRN_ID,
        organisationId: ORG_ID,
        accreditationId: ACC_ID,
        registrationId: REG_ID,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })

    const results = await Promise.allSettled([issue(), issue()])

    await expectOneWinsOneStreamConflict(results, streamRepository)
  })

  it('credits the waste balance only once when two deletes race for an awaiting_authorisation PRN', async () => {
    const prnFactory = createInMemoryPackagingRecyclingNotesRepository([
      buildIssuableSeed()
    ])
    const prnRepository = prnFactory(noopLogger())

    const balanceSeed = buildBalanceSeed({
      availableAmount: RINGFENCED_AVAILABLE
    })
    const streamRepository = createInMemoryStreamRepository()()
    await seedClosingBalance(streamRepository, balanceSeed)
    const wasteFactory = createInMemoryWasteBalancesRepository([balanceSeed], {
      streamRepository
    })
    const wasteBalancesRepository = wasteFactory()

    const organisationsRepository = buildOrganisationsRepository()

    const cancel = () =>
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository,
        logger: noopLogger(),
        id: PRN_ID,
        organisationId: ORG_ID,
        accreditationId: ACC_ID,
        registrationId: REG_ID,
        newStatus: PRN_STATUS.DELETED,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })

    const results = await Promise.allSettled([cancel(), cancel()])

    await expectOneWinsOneStreamConflict(results, streamRepository)
  })

  it('credits the waste balance only once when two cancels race for an awaiting_cancellation PRN', async () => {
    const prnFactory = createInMemoryPackagingRecyclingNotesRepository([
      buildAwaitingCancellationSeed()
    ])
    const prnRepository = prnFactory(noopLogger())

    const balanceSeed = buildBalanceSeed({
      availableAmount: RINGFENCED_AVAILABLE,
      amount: ISSUED_AMOUNT
    })
    const streamRepository = createInMemoryStreamRepository()()
    await seedClosingBalance(streamRepository, balanceSeed)
    const wasteFactory = createInMemoryWasteBalancesRepository([balanceSeed], {
      streamRepository
    })
    const wasteBalancesRepository = wasteFactory()

    const organisationsRepository = buildOrganisationsRepository()

    const cancel = () =>
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository,
        logger: noopLogger(),
        id: PRN_ID,
        organisationId: ORG_ID,
        accreditationId: ACC_ID,
        registrationId: REG_ID,
        newStatus: PRN_STATUS.CANCELLED,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })

    const results = await Promise.allSettled([cancel(), cancel()])

    await expectOneWinsOneStreamConflict(results, streamRepository)
  })
})
