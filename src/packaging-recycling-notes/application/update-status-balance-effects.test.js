import { describe, it, expect, vi } from 'vitest'

import {
  applyWasteBalanceEffects,
  balanceEventsFor
} from './update-status-balance-effects.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createWasteBalancesRepository } from '#waste-balances/repository/repository.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'
import { StreamSlotConflictError } from '#waste-balances/repository/stream-port.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'

const REGISTRATION_ID = 'reg-1'
const ACCREDITATION_ID = 'acc-1'
const ORGANISATION_ID = 'org-1'
const SEEDED_EVENT_NUMBER = 1
const APPENDED_EVENT_NUMBER = 2

const buildLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn()
})

/**
 * An in-memory repository seeded with one stream event so the read resolves a
 * non-zero balance. The next balance effect appends a second event, so the
 * returned watermark is APPENDED_EVENT_NUMBER.
 */
const setupLedgerRepository = async () => {
  const streamRepository = createInMemoryStreamRepository()()
  await streamRepository.appendEvent(
    buildStreamEvent({
      registrationId: REGISTRATION_ID,
      accreditationId: ACCREDITATION_ID,
      number: SEEDED_EVENT_NUMBER,
      closingBalance: { amount: 100, availableAmount: 100 }
    })
  )

  const wasteBalancesRepository = createWasteBalancesRepository({
    streamRepository
  })()

  return { wasteBalancesRepository, streamRepository }
}

const balanceParamsFor = (overrides) => ({
  prnId: 'prn-1',
  tonnage: 10,
  accreditationId: ACCREDITATION_ID,
  registrationId: REGISTRATION_ID,
  organisationId: ORGANISATION_ID,
  createdBy: { id: 'user-1' },
  ...overrides
})

const eventsForTransition = (currentStatus, newStatus) =>
  balanceEventsFor(
    currentStatus,
    newStatus,
    balanceParamsFor({ currentStatus, newStatus })
  )

describe('applyWasteBalanceEffects appended events return', () => {
  it('returns the appended event from the deduct-available branch', async () => {
    const { wasteBalancesRepository, streamRepository } =
      await setupLedgerRepository()

    const applied = await applyWasteBalanceEffects(
      wasteBalancesRepository,
      buildLogger(),
      eventsForTransition(PRN_STATUS.DRAFT, PRN_STATUS.AWAITING_AUTHORISATION)
    )

    const latest = await streamRepository.findLatestByPartition(
      REGISTRATION_ID,
      ACCREDITATION_ID
    )
    expect(applied).toHaveLength(1)
    expect(applied[0]?.number).toBe(latest?.number)
    expect(applied[0]?.number).toBe(APPENDED_EVENT_NUMBER)
  })

  it('returns the appended event from the deduct-total branch', async () => {
    const { wasteBalancesRepository, streamRepository } =
      await setupLedgerRepository()

    const applied = await applyWasteBalanceEffects(
      wasteBalancesRepository,
      buildLogger(),
      eventsForTransition(
        PRN_STATUS.AWAITING_AUTHORISATION,
        PRN_STATUS.AWAITING_ACCEPTANCE
      )
    )

    const latest = await streamRepository.findLatestByPartition(
      REGISTRATION_ID,
      ACCREDITATION_ID
    )
    expect(applied[0]?.number).toBe(latest?.number)
    expect(applied[0]?.number).toBe(APPENDED_EVENT_NUMBER)
  })

  it('returns the appended event from the credit-available branch', async () => {
    const { wasteBalancesRepository, streamRepository } =
      await setupLedgerRepository()

    const applied = await applyWasteBalanceEffects(
      wasteBalancesRepository,
      buildLogger(),
      eventsForTransition(PRN_STATUS.AWAITING_AUTHORISATION, PRN_STATUS.DELETED)
    )

    const latest = await streamRepository.findLatestByPartition(
      REGISTRATION_ID,
      ACCREDITATION_ID
    )
    expect(applied[0]?.number).toBe(latest?.number)
    expect(applied[0]?.number).toBe(APPENDED_EVENT_NUMBER)
  })

  it('returns the appended event from the prn-accepted branch', async () => {
    const { wasteBalancesRepository, streamRepository } =
      await setupLedgerRepository()

    const applied = await applyWasteBalanceEffects(
      wasteBalancesRepository,
      buildLogger(),
      eventsForTransition(PRN_STATUS.AWAITING_ACCEPTANCE, PRN_STATUS.ACCEPTED)
    )

    const latest = await streamRepository.findLatestByPartition(
      REGISTRATION_ID,
      ACCREDITATION_ID
    )
    expect(applied[0]?.kind).toBe(STREAM_EVENT_KIND.PRN_ACCEPTED)
    expect(applied[0]?.number).toBe(latest?.number)
    expect(applied[0]?.number).toBe(APPENDED_EVENT_NUMBER)
  })

  it('returns the appended event from the prn-rejected branch', async () => {
    const { wasteBalancesRepository, streamRepository } =
      await setupLedgerRepository()

    const applied = await applyWasteBalanceEffects(
      wasteBalancesRepository,
      buildLogger(),
      eventsForTransition(
        PRN_STATUS.AWAITING_ACCEPTANCE,
        PRN_STATUS.AWAITING_CANCELLATION
      )
    )

    const latest = await streamRepository.findLatestByPartition(
      REGISTRATION_ID,
      ACCREDITATION_ID
    )
    expect(applied[0]?.kind).toBe(STREAM_EVENT_KIND.PRN_REJECTED)
    expect(applied[0]?.number).toBe(latest?.number)
    expect(applied[0]?.number).toBe(APPENDED_EVENT_NUMBER)
  })

  it('returns the appended event from the credit-full branch', async () => {
    const { wasteBalancesRepository, streamRepository } =
      await setupLedgerRepository()

    const applied = await applyWasteBalanceEffects(
      wasteBalancesRepository,
      buildLogger(),
      eventsForTransition(
        PRN_STATUS.AWAITING_CANCELLATION,
        PRN_STATUS.CANCELLED
      )
    )

    const latest = await streamRepository.findLatestByPartition(
      REGISTRATION_ID,
      ACCREDITATION_ID
    )
    expect(applied[0]?.number).toBe(latest?.number)
    expect(applied[0]?.number).toBe(APPENDED_EVENT_NUMBER)
  })

  it('returns an empty array when the events array is empty', async () => {
    const { wasteBalancesRepository } = await setupLedgerRepository()

    const applied = await applyWasteBalanceEffects(
      wasteBalancesRepository,
      buildLogger(),
      []
    )

    expect(applied).toEqual([])
  })
})

/**
 * Replace the repository's append with one that lands a single competing event
 * the first time it is called, then delegates. This makes the effect's append
 * collide on the slot the competing writer has taken, exercising the
 * optimistic-concurrency guard.
 *
 * @param {import('#waste-balances/repository/stream-port.js').WasteBalanceStreamRepository} streamRepository
 * @param {object} competingEvent
 */
const landCompetingEventOnFirstAppend = (streamRepository, competingEvent) => {
  const realAppend = streamRepository.appendEvent.bind(streamRepository)
  let landed = false
  streamRepository.appendEvent = async (event) => {
    if (!landed) {
      landed = true
      await realAppend(buildStreamEvent(competingEvent))
    }
    return realAppend(event)
  }
}

describe('applyWasteBalanceEffects optimistic concurrency', () => {
  it('surfaces a slot conflict when a competing event takes the targeted slot', async () => {
    const { wasteBalancesRepository, streamRepository } =
      await setupLedgerRepository()

    landCompetingEventOnFirstAppend(streamRepository, {
      registrationId: REGISTRATION_ID,
      accreditationId: ACCREDITATION_ID,
      number: 2,
      kind: STREAM_EVENT_KIND.PRN_CREATED,
      payload: { prnId: 'competing-prn', amount: 70 },
      openingBalance: { amount: 100, availableAmount: 100 },
      closingBalance: { amount: 100, availableAmount: 30 }
    })

    const events = balanceEventsFor(
      PRN_STATUS.DRAFT,
      PRN_STATUS.AWAITING_AUTHORISATION,
      balanceParamsFor({
        tonnage: 80,
        currentStatus: PRN_STATUS.DRAFT,
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION
      })
    )

    await expect(
      applyWasteBalanceEffects(wasteBalancesRepository, buildLogger(), events)
    ).rejects.toBeInstanceOf(StreamSlotConflictError)

    const all = await streamRepository.findAllByPartition(
      REGISTRATION_ID,
      ACCREDITATION_ID
    )
    expect(all).toHaveLength(2)
  })
})

describe('balanceEventsFor', () => {
  const params = balanceParamsFor({
    currentStatus: PRN_STATUS.DRAFT,
    newStatus: PRN_STATUS.AWAITING_AUTHORISATION
  })

  it('emits a prn-created event for PRN creation', () => {
    expect(
      balanceEventsFor(
        PRN_STATUS.DRAFT,
        PRN_STATUS.AWAITING_AUTHORISATION,
        params
      )
    ).toEqual([{ kind: STREAM_EVENT_KIND.PRN_CREATED, params }])
  })

  it('emits a prn-issued event for PRN issuance', () => {
    expect(
      balanceEventsFor(
        PRN_STATUS.AWAITING_AUTHORISATION,
        PRN_STATUS.AWAITING_ACCEPTANCE,
        params
      )
    ).toEqual([{ kind: STREAM_EVENT_KIND.PRN_ISSUED, params }])
  })

  it('emits a prn-creation-cancelled event for deleting a PRN awaiting authorisation', () => {
    expect(
      balanceEventsFor(
        PRN_STATUS.AWAITING_AUTHORISATION,
        PRN_STATUS.DELETED,
        params
      )
    ).toEqual([{ kind: STREAM_EVENT_KIND.PRN_CREATION_CANCELLED, params }])
  })

  it('emits a prn-cancelled-after-issue event for cancelling an issued PRN', () => {
    expect(
      balanceEventsFor(
        PRN_STATUS.AWAITING_CANCELLATION,
        PRN_STATUS.CANCELLED,
        params
      )
    ).toEqual([{ kind: STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE, params }])
  })

  it('emits a prn-accepted event for accepting an issued PRN', () => {
    expect(
      balanceEventsFor(
        PRN_STATUS.AWAITING_ACCEPTANCE,
        PRN_STATUS.ACCEPTED,
        params
      )
    ).toEqual([{ kind: STREAM_EVENT_KIND.PRN_ACCEPTED, params }])
  })

  it('emits a prn-rejected event for requesting cancellation of an issued PRN', () => {
    expect(
      balanceEventsFor(
        PRN_STATUS.AWAITING_ACCEPTANCE,
        PRN_STATUS.AWAITING_CANCELLATION,
        params
      )
    ).toEqual([{ kind: STREAM_EVENT_KIND.PRN_REJECTED, params }])
  })

  it('emits no events when discarding a draft PRN', () => {
    expect(
      balanceEventsFor(PRN_STATUS.DRAFT, PRN_STATUS.DISCARDED, params)
    ).toEqual([])
  })

  it('emits no events for an awaiting-authorisation to cancelled move the state machine forbids', () => {
    expect(
      balanceEventsFor(
        PRN_STATUS.AWAITING_AUTHORISATION,
        PRN_STATUS.CANCELLED,
        params
      )
    ).toEqual([])
  })
})
