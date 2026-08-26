import { describe, it, expect, vi } from 'vitest'

import {
  PRN_STATUS,
  PRN_ACTOR,
  AccreditationStatusError,
  StatusConflictError
} from '#packaging-recycling-notes/domain/model.js'
import { ACCREDITATION_STATUS, REGULATOR } from '#domain/organisations/model.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { LedgerSlotConflictError } from '#waste-balances/repository/ledger-port.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import {
  buildDraftPrn,
  buildAwaitingAuthorisationPrn,
  buildAwaitingAcceptancePrn
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import {
  buildLedgerEvent,
  buildPrnCreatedEvent,
  buildPrnRejectedEvent,
  buildPrnAcceptedEvent,
  buildPrnCancelledAfterIssueEvent
} from '#waste-balances/repository/ledger-test-data.js'

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
  registrationId: REG_ID,
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

const buildDraftSeed = () =>
  /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} */ (
    buildDraftPrn(PRN_BASE)
  )
const buildIssuableSeed = () =>
  /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} */ (
    buildAwaitingAuthorisationPrn(PRN_BASE)
  )
const buildAwaitingAcceptanceSeed = () =>
  /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} */ (
    buildAwaitingAcceptancePrn(PRN_BASE)
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
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 * @param {{ amount: number, availableAmount: number }} balanceSeed
 */
const seedClosingBalance = (ledgerRepository, balanceSeed) =>
  ledgerRepository.appendEvents([
    buildLedgerEvent({
      registrationId: REG_ID,
      accreditationId: ACC_ID,
      organisationId: ORG_ID,
      number: 1,
      closingBalance: {
        amount: balanceSeed.amount,
        availableAmount: balanceSeed.availableAmount
      }
    })
  ])

/**
 * A ledger whose head moves mid-command: the first `findLatestInLedger` — the
 * read a command's fold opens with — lands a competing event before it
 * resolves. A ruling made after the fold sees that event; one made before it
 * does not.
 *
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 * @param {import('#waste-balances/repository/ledger-port.js').LedgerEvent} competingEvent
 * @returns {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository}
 */
const withCompetingWriteDuringFold = (ledgerRepository, competingEvent) => {
  let landed = false

  return {
    ...ledgerRepository,
    findLatestInLedger: async (ledgerId) => {
      if (!landed) {
        landed = true
        await ledgerRepository.appendEvents([competingEvent])
      }
      return ledgerRepository.findLatestInLedger(ledgerId)
    }
  }
}

/**
 * An accreditation suspended mid-command: approved when the request arrives,
 * suspended by the time the fold resolves. Only a check made against a read
 * taken after the fold sees the suspension, so this is the ordering the write
 * depends on rather than one the caller can arrange.
 *
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 */
const withAccreditationSuspendedDuringFold = (ledgerRepository) => {
  /** @type {import('#domain/organisations/model.js').AccreditationStatus} */
  let status = ACCREDITATION_STATUS.APPROVED

  return {
    ledgerRepository: {
      ...ledgerRepository,
      findLatestInLedger: async (
        /** @type {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} */ ledgerId
      ) => {
        status = ACCREDITATION_STATUS.SUSPENDED
        return ledgerRepository.findLatestInLedger(ledgerId)
      }
    },
    organisationsRepository:
      /** @type {import('#repositories/organisations/port.js').OrganisationsRepository} */ (
        /** @type {unknown} */ ({
          findAccreditationById: async () => ({
            status,
            submittedToRegulator: REGULATOR.EA
          })
        })
      )
  }
}

const buildOrganisationsRepository = () =>
  /** @type {import('#repositories/organisations/port.js').OrganisationsRepository} */ (
    /** @type {unknown} */ ({
      findAccreditationById: vi.fn().mockResolvedValue({
        status: ACCREDITATION_STATUS.APPROVED,
        submittedToRegulator: REGULATOR.EA
      })
    })
  )

const COMMITTED_EVENT_NUMBER = 2

/**
 * On the ledger path concurrent writers serialise at the append-only stream
 * slot: the first writer claims the next slot, the second collides with a
 * LedgerSlotConflictError. Exactly one writer commits, so the stream holds a
 * single event past the seed and the PRN document — persisted only by the
 * winner, since the loser fails at the stream append before persisting —
 * reflects that one transition.
 *
 * @param {PromiseSettledResult<unknown>[]} results
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 * @param {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} prnRepository
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnStatus} expectedStatus
 */
const expectOneWinsOneStreamConflict = async (
  results,
  ledgerRepository,
  prnRepository,
  expectedStatus
) => {
  const fulfilled = results.filter((r) => r.status === 'fulfilled')
  const rejected = results.filter((r) => r.status === 'rejected')

  expect(fulfilled).toHaveLength(1)
  expect(rejected).toHaveLength(1)
  expect(rejected[0].reason).toBeInstanceOf(LedgerSlotConflictError)

  const latest = await ledgerRepository.findLatestInLedger({
    organisationId: ORG_ID,
    registrationId: REG_ID,
    accreditationId: ACC_ID
  })
  expect(latest?.number).toBe(COMMITTED_EVENT_NUMBER)

  const prn = await prnRepository.findById(PRN_ID)
  expect(prn?.status.currentStatus).toBe(expectedStatus)
}

describe('updatePrnStatus concurrency', () => {
  it('debits the waste balance only once when two issuances race for the same PRN', async () => {
    const prnFactory = createInMemoryPackagingRecyclingNotesRepository([
      buildIssuableSeed()
    ])
    const prnRepository = prnFactory(noopLogger())

    const balanceSeed = buildBalanceSeed()
    const ledgerRepository = createInMemoryLedgerRepository()()
    await seedClosingBalance(ledgerRepository, balanceSeed)
    const organisationsRepository = buildOrganisationsRepository()

    const issue = () =>
      updatePrnStatus({
        prnRepository,
        ledgerRepository,
        organisationsRepository,
        prnEvents: { onCancelled: vi.fn().mockResolvedValue(undefined) },
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

    await expectOneWinsOneStreamConflict(
      results,
      ledgerRepository,
      prnRepository,
      PRN_STATUS.AWAITING_ACCEPTANCE
    )
  })

  it('credits the waste balance only once when two deletes race for an awaiting_authorisation PRN', async () => {
    const prnFactory = createInMemoryPackagingRecyclingNotesRepository([
      buildIssuableSeed()
    ])
    const prnRepository = prnFactory(noopLogger())

    const balanceSeed = buildBalanceSeed({
      availableAmount: RINGFENCED_AVAILABLE
    })
    const ledgerRepository = createInMemoryLedgerRepository()()
    await seedClosingBalance(ledgerRepository, balanceSeed)
    const organisationsRepository = buildOrganisationsRepository()

    const cancel = () =>
      updatePrnStatus({
        prnRepository,
        ledgerRepository,
        organisationsRepository,
        prnEvents: { onCancelled: vi.fn().mockResolvedValue(undefined) },
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

    await expectOneWinsOneStreamConflict(
      results,
      ledgerRepository,
      prnRepository,
      PRN_STATUS.DELETED
    )
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
    const ledgerRepository = createInMemoryLedgerRepository()()
    await seedClosingBalance(ledgerRepository, balanceSeed)
    const organisationsRepository = buildOrganisationsRepository()

    const cancel = () =>
      updatePrnStatus({
        prnRepository,
        ledgerRepository,
        organisationsRepository,
        prnEvents: { onCancelled: vi.fn().mockResolvedValue(undefined) },
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

    await expectOneWinsOneStreamConflict(
      results,
      ledgerRepository,
      prnRepository,
      PRN_STATUS.CANCELLED
    )
  })

  it('refuses a cancellation whose event is already on the ledger but not yet projected', async () => {
    const prnFactory = createInMemoryPackagingRecyclingNotesRepository([
      buildAwaitingCancellationSeed()
    ])
    const prnRepository = prnFactory(noopLogger())

    const balanceSeed = buildBalanceSeed({
      availableAmount: RINGFENCED_AVAILABLE,
      amount: ISSUED_AMOUNT
    })
    const ledgerRepository = createInMemoryLedgerRepository()()
    await seedClosingBalance(ledgerRepository, balanceSeed)

    // The cancellation already committed its ledger event and then died before
    // persisting the projection, so the document still reads
    // awaiting_cancellation while the credit is banked.
    await ledgerRepository.appendEvents([
      buildPrnCancelledAfterIssueEvent({
        registrationId: REG_ID,
        accreditationId: ACC_ID,
        organisationId: ORG_ID,
        number: 2,
        payload: { prnId: PRN_ID, amount: TONNAGE },
        openingBalance: {
          amount: ISSUED_AMOUNT,
          availableAmount: RINGFENCED_AVAILABLE
        },
        closingBalance: {
          amount: ISSUED_AMOUNT + TONNAGE,
          availableAmount: RINGFENCED_AVAILABLE + TONNAGE
        }
      })
    ])

    await expect(
      updatePrnStatus({
        prnRepository,
        ledgerRepository,
        organisationsRepository: buildOrganisationsRepository(),
        prnEvents: { onCancelled: vi.fn().mockResolvedValue(undefined) },
        logger: noopLogger(),
        id: PRN_ID,
        organisationId: ORG_ID,
        accreditationId: ACC_ID,
        registrationId: REG_ID,
        newStatus: PRN_STATUS.CANCELLED,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toBeInstanceOf(StatusConflictError)

    const latest = await ledgerRepository.findLatestInLedger({
      organisationId: ORG_ID,
      registrationId: REG_ID,
      accreditationId: ACC_ID
    })
    expect(latest?.number).toBe(2)
    expect(latest?.closingBalance).toEqual({
      amount: ISSUED_AMOUNT + TONNAGE,
      availableAmount: RINGFENCED_AVAILABLE + TONNAGE
    })
  })

  it('rules on the accreditation against a read taken after the fold, not before it', async () => {
    const prnFactory = createInMemoryPackagingRecyclingNotesRepository([
      buildIssuableSeed()
    ])
    const prnRepository = prnFactory(noopLogger())

    const seeded = createInMemoryLedgerRepository()()
    await seedClosingBalance(seeded, buildBalanceSeed())

    const { ledgerRepository, organisationsRepository } =
      withAccreditationSuspendedDuringFold(seeded)

    await expect(
      updatePrnStatus({
        prnRepository,
        ledgerRepository,
        organisationsRepository,
        prnEvents: { onCancelled: vi.fn().mockResolvedValue(undefined) },
        logger: noopLogger(),
        id: PRN_ID,
        organisationId: ORG_ID,
        accreditationId: ACC_ID,
        registrationId: REG_ID,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toBeInstanceOf(AccreditationStatusError)

    const stored = await prnRepository.findById(PRN_ID)
    expect(stored?.status.currentStatus).toBe(PRN_STATUS.AWAITING_AUTHORISATION)
    expect(
      await ledgerRepository.findLatestInLedger({
        organisationId: ORG_ID,
        registrationId: REG_ID,
        accreditationId: ACC_ID
      })
    ).toMatchObject({ number: 1 })
  })

  it('commits a cancellation the stream permits but the unprojected document does not', async () => {
    const prnFactory = createInMemoryPackagingRecyclingNotesRepository([
      buildAwaitingAcceptanceSeed()
    ])
    const prnRepository = prnFactory(noopLogger())

    const ledgerRepository = createInMemoryLedgerRepository()()
    await seedClosingBalance(ledgerRepository, {
      amount: ISSUED_AMOUNT,
      availableAmount: RINGFENCED_AVAILABLE
    })

    // The producer's rejection reached the stream but not the document, so the
    // document still reads awaiting_acceptance while the PRN is really
    // awaiting_cancellation — a status the signatory may cancel from.
    await ledgerRepository.appendEvents([
      buildPrnRejectedEvent({
        registrationId: REG_ID,
        accreditationId: ACC_ID,
        organisationId: ORG_ID,
        number: 2,
        payload: { prnId: PRN_ID, amount: TONNAGE },
        openingBalance: {
          amount: ISSUED_AMOUNT,
          availableAmount: RINGFENCED_AVAILABLE
        },
        closingBalance: {
          amount: ISSUED_AMOUNT,
          availableAmount: RINGFENCED_AVAILABLE
        }
      })
    ])

    const cancelled = await updatePrnStatus({
      prnRepository,
      ledgerRepository,
      organisationsRepository: buildOrganisationsRepository(),
      prnEvents: { onCancelled: vi.fn().mockResolvedValue(undefined) },
      logger: noopLogger(),
      id: PRN_ID,
      organisationId: ORG_ID,
      accreditationId: ACC_ID,
      registrationId: REG_ID,
      newStatus: PRN_STATUS.CANCELLED,
      actor: PRN_ACTOR.SIGNATORY,
      user: { id: 'user-789', name: 'Test User' }
    })

    expect(cancelled.status.currentStatus).toBe(PRN_STATUS.CANCELLED)
    // The rejection the document had not seen is projected too, not skipped
    // over by the cancellation that followed it.
    expect(cancelled.status.rejected).toBeDefined()

    const latest = await ledgerRepository.findLatestInLedger({
      organisationId: ORG_ID,
      registrationId: REG_ID,
      accreditationId: ACC_ID
    })
    expect(latest?.number).toBe(3)
    expect(latest?.closingBalance).toEqual({
      amount: ISSUED_AMOUNT + TONNAGE,
      availableAmount: RINGFENCED_AVAILABLE + TONNAGE
    })
  })

  it('rules on the transition against the head the command folded, not an earlier one', async () => {
    const prnFactory = createInMemoryPackagingRecyclingNotesRepository([
      buildAwaitingAcceptanceSeed()
    ])
    const prnRepository = prnFactory(noopLogger())

    const ledgerRepository = createInMemoryLedgerRepository()()
    await seedClosingBalance(ledgerRepository, {
      amount: ISSUED_AMOUNT,
      availableAmount: RINGFENCED_AVAILABLE
    })

    // The producer's acceptance lands while this command is folding: it is not
    // on the ledger when the request arrives, and is by the time the fold
    // resolves. Only a ruling taken after the fold can see it, so this is the
    // ordering the write depends on rather than one the caller can arrange.
    const racingLedger = withCompetingWriteDuringFold(
      ledgerRepository,
      buildPrnAcceptedEvent({
        organisationId: ORG_ID,
        registrationId: REG_ID,
        accreditationId: ACC_ID,
        number: 2,
        payload: { prnId: PRN_ID, amount: TONNAGE },
        openingBalance: {
          amount: ISSUED_AMOUNT,
          availableAmount: RINGFENCED_AVAILABLE
        },
        closingBalance: {
          amount: ISSUED_AMOUNT,
          availableAmount: RINGFENCED_AVAILABLE
        }
      })
    )

    await expect(
      updatePrnStatus({
        prnRepository,
        ledgerRepository: racingLedger,
        organisationsRepository: buildOrganisationsRepository(),
        prnEvents: { onCancelled: vi.fn().mockResolvedValue(undefined) },
        logger: noopLogger(),
        id: PRN_ID,
        organisationId: ORG_ID,
        accreditationId: ACC_ID,
        registrationId: REG_ID,
        newStatus: PRN_STATUS.ACCEPTED,
        actor: PRN_ACTOR.PRODUCER,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toBeInstanceOf(StatusConflictError)

    // A second acceptance would have taken slot 3 with every guard satisfied.
    const all = await ledgerRepository.findAllInLedger({
      organisationId: ORG_ID,
      registrationId: REG_ID,
      accreditationId: ACC_ID
    })
    expect(all).toHaveLength(2)
    expect(all[1].kind).toBe(LEDGER_EVENT_KIND.PRN_ACCEPTED)
  })

  it('refuses a discard whose creation event is already on the ledger but not yet projected', async () => {
    const prnFactory = createInMemoryPackagingRecyclingNotesRepository([
      buildDraftSeed()
    ])
    const prnRepository = prnFactory(noopLogger())

    const ledgerRepository = createInMemoryLedgerRepository()()
    await seedClosingBalance(ledgerRepository, {
      amount: STARTING_TOTAL,
      availableAmount: STARTING_TOTAL
    })

    // Creation banked its ringfence on the stream but never projected, so the
    // document still reads draft — a status a discard is legal from, and the
    // real status is not.
    await ledgerRepository.appendEvents([
      buildPrnCreatedEvent({
        registrationId: REG_ID,
        accreditationId: ACC_ID,
        organisationId: ORG_ID,
        number: 2,
        payload: { prnId: PRN_ID, amount: TONNAGE },
        openingBalance: {
          amount: STARTING_TOTAL,
          availableAmount: STARTING_TOTAL
        },
        closingBalance: {
          amount: STARTING_TOTAL,
          availableAmount: STARTING_TOTAL - TONNAGE
        }
      })
    ])

    await expect(
      updatePrnStatus({
        prnRepository,
        ledgerRepository,
        organisationsRepository: buildOrganisationsRepository(),
        prnEvents: { onCancelled: vi.fn().mockResolvedValue(undefined) },
        logger: noopLogger(),
        id: PRN_ID,
        organisationId: ORG_ID,
        accreditationId: ACC_ID,
        registrationId: REG_ID,
        newStatus: PRN_STATUS.DISCARDED,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toBeInstanceOf(StatusConflictError)

    const stored = await prnRepository.findById(PRN_ID)
    expect(stored?.status.currentStatus).toBe(PRN_STATUS.DRAFT)
  })
})
