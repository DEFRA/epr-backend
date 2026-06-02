import { describe, it, expect, vi } from 'vitest'

import {
  PRN_STATUS,
  PRN_ACTOR
} from '#packaging-recycling-notes/domain/model.js'
import { REGULATOR } from '#domain/organisations/model.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryWasteBalancesRepository } from '#waste-balances/repository/inmemory.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import {
  buildAwaitingAuthorisationPrn,
  buildAwaitingAcceptancePrn
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createMockLogger } from '#test/mock-logger.js'

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

const noopLogger = () => createMockLogger()

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

const buildBalanceSeed = (overrides = {}) => ({
  id: 'wb-1',
  accreditationId: ACC_ID,
  organisationId: ORG_ID,
  amount: 1000,
  availableAmount: 1000,
  transactions: [],
  version: 0,
  schemaVersion: 1,
  canonicalSource: 'embedded',
  ...overrides
})

const buildOrganisationsRepository = () =>
  /** @type {import('#repositories/organisations/port.js').OrganisationsRepository} */ (
    /** @type {unknown} */ ({
      findAccreditationById: vi.fn().mockResolvedValue({
        submittedToRegulator: REGULATOR.EA
      })
    })
  )

const expectOneWinsOneVersionConflict = (results) => {
  const fulfilled = results.filter((r) => r.status === 'fulfilled')
  const rejected = results.filter((r) => r.status === 'rejected')

  expect(fulfilled).toHaveLength(1)
  expect(rejected).toHaveLength(1)
  expect(rejected[0].reason).toMatchObject({
    isBoom: true,
    output: { statusCode: 409 }
  })
  expect(rejected[0].reason.message).toMatch(/Version conflict/)
}

describe('updatePrnStatus concurrency', () => {
  it('debits the waste balance only once when two issuances race for the same PRN', async () => {
    const prnFactory = createInMemoryPackagingRecyclingNotesRepository([
      buildIssuableSeed()
    ])
    const prnRepository = prnFactory(noopLogger())

    const wasteFactory = createInMemoryWasteBalancesRepository(
      [buildBalanceSeed()],
      { streamRepository: createInMemoryStreamRepository()() }
    )
    const realWasteBalancesRepository = wasteFactory()
    const deductSpy = vi.fn(
      realWasteBalancesRepository.deductTotalBalanceForPrnIssue
    )
    const wasteBalancesRepository = {
      ...realWasteBalancesRepository,
      deductTotalBalanceForPrnIssue: deductSpy
    }

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

    expectOneWinsOneVersionConflict(results)
    expect(deductSpy).toHaveBeenCalledTimes(1)
  })

  it('credits the waste balance only once when two deletes race for an awaiting_authorisation PRN', async () => {
    const prnFactory = createInMemoryPackagingRecyclingNotesRepository([
      buildIssuableSeed()
    ])
    const prnRepository = prnFactory(noopLogger())

    const wasteFactory = createInMemoryWasteBalancesRepository(
      [buildBalanceSeed({ availableAmount: RINGFENCED_AVAILABLE })],
      { streamRepository: createInMemoryStreamRepository()() }
    )
    const realWasteBalancesRepository = wasteFactory()
    const creditSpy = vi.fn(
      realWasteBalancesRepository.creditAvailableBalanceForPrnCancellation
    )
    const wasteBalancesRepository = {
      ...realWasteBalancesRepository,
      creditAvailableBalanceForPrnCancellation: creditSpy
    }

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

    expectOneWinsOneVersionConflict(results)
    expect(creditSpy).toHaveBeenCalledTimes(1)
  })

  it('credits the waste balance only once when two cancels race for an awaiting_cancellation PRN', async () => {
    const prnFactory = createInMemoryPackagingRecyclingNotesRepository([
      buildAwaitingCancellationSeed()
    ])
    const prnRepository = prnFactory(noopLogger())

    const wasteFactory = createInMemoryWasteBalancesRepository(
      [
        buildBalanceSeed({
          availableAmount: RINGFENCED_AVAILABLE,
          amount: ISSUED_AMOUNT
        })
      ],
      { streamRepository: createInMemoryStreamRepository()() }
    )
    const realWasteBalancesRepository = wasteFactory()
    const creditSpy = vi.fn(
      realWasteBalancesRepository.creditFullBalanceForIssuedPrnCancellation
    )
    const wasteBalancesRepository = {
      ...realWasteBalancesRepository,
      creditFullBalanceForIssuedPrnCancellation: creditSpy
    }

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

    expectOneWinsOneVersionConflict(results)
    expect(creditSpy).toHaveBeenCalledTimes(1)
  })
})
