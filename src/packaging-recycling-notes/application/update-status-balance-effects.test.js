import { describe, it, expect, vi } from 'vitest'

import {
  applyPrnTransition,
  prnCommandFor
} from './update-status-balance-effects.js'
import {
  PRN_STATUS,
  PRN_ACTOR,
  PRN_STATUS_TRANSITIONS
} from '#packaging-recycling-notes/domain/model.js'
import {
  createPrn as decideCreatePrn,
  issuePrn as decideIssuePrn,
  cancelPrnCreation as decideCancelPrnCreation,
  cancelIssuedPrn as decideCancelIssuedPrn,
  acceptPrn as decideAcceptPrn,
  rejectPrn as decideRejectPrn
} from '#waste-balances/domain/commands.js'
import { ACCREDITATION_STATUS, REGULATOR } from '#domain/organisations/model.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import {
  buildPrn,
  buildAccreditation as buildPrnAccreditation
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { buildAccreditation } from '#repositories/organisations/contract/test-data.js'

/**
 * @import { LedgerEvent } from '#waste-balances/repository/ledger-schema.js'
 */

const REGISTRATION_ID = 'reg-1'
const ACCREDITATION_ID = 'acc-1'
const ORGANISATION_ID = 'org-1'
const PRN_ID = 'prn-1'
const TONNAGE = 10
const SEED_NUMBER = 1
const APPENDED_NUMBER = 2

const ledgerId = {
  organisationId: ORGANISATION_ID,
  registrationId: REGISTRATION_ID,
  accreditationId: ACCREDITATION_ID
}
const createdBy = { id: 'user-1' }

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
 * A service over an in-memory stream. With a closing balance the ledger is
 * seeded with one summary-log event so commands resolve a balance; without one
 * the ledger is empty and commands reject with NO_LEDGER.
 */
const serviceWithBalance = (closingBalance) => {
  const events = closingBalance
    ? [
        buildLedgerEvent({
          registrationId: REGISTRATION_ID,
          accreditationId: ACCREDITATION_ID,
          organisationId: ORGANISATION_ID,
          number: SEED_NUMBER,
          closingBalance
        })
      ]
    : []
  return createWasteBalanceService(
    createInMemoryLedgerRepository(/** @type {LedgerEvent[]} */ (events))()
  )
}

/**
 * A PRN document sitting at `currentStatus` with nothing unprojected behind it,
 * so the transition is ruled on exactly that status.
 *
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnStatus} currentStatus
 */
const prnAt = (currentStatus) =>
  /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} */ ({
    ...buildPrn({
      id: PRN_ID,
      registrationId: REGISTRATION_ID,
      organisation: {
        id: ORGANISATION_ID,
        name: 'Test Reprocessor',
        tradingName: 'Trading Name'
      },
      accreditation: buildPrnAccreditation({
        id: ACCREDITATION_ID,
        accreditationYear: 2026
      }),
      tonnage: TONNAGE
    }),
    lastAppliedEventNumber: SEED_NUMBER,
    status:
      /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote['status']} */ ({
        currentStatus
      })
  })

/**
 * @param {ReturnType<typeof createWasteBalanceService>} service
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnStatus} currentStatus
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnStatus} newStatus
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnActor} actor
 */
const applyTransition = (service, logger, currentStatus, newStatus, actor) =>
  applyPrnTransition(service, logger, {
    prn: prnAt(currentStatus),
    ledgerId,
    newStatus,
    actor,
    accreditation: buildAccreditation({
      status: ACCREDITATION_STATUS.APPROVED,
      submittedToRegulator: REGULATOR.EA
    }),
    tonnage: TONNAGE,
    createdBy,
    now: new Date('2026-06-01T00:00:00.000Z')
  })

describe('every permitted transition is routed to a write path', () => {
  // `updatePrnStatus` sends DISCARDED to the write that appends no event and
  // everything else to the ledger, so a transition with no command must be
  // exactly the one the discard path handles. Adding a transition to the state
  // machine without a balance decision fails here rather than in production.
  const permitted = Object.entries(PRN_STATUS_TRANSITIONS).flatMap(
    ([fromStatus, transitions]) =>
      transitions.map((transition) => [fromStatus, transition.status])
  )

  it.each(permitted)('%s -> %s', (fromStatus, newStatus) => {
    const isDiscard =
      fromStatus === PRN_STATUS.DRAFT && newStatus === PRN_STATUS.DISCARDED

    expect(Boolean(prnCommandFor(fromStatus, newStatus))).toBe(!isDiscard)
  })
})

describe('prnCommandFor', () => {
  it.each([
    [
      PRN_STATUS.DRAFT,
      PRN_STATUS.AWAITING_AUTHORISATION,
      decideCreatePrn,
      'deduct_available'
    ],
    [
      PRN_STATUS.AWAITING_AUTHORISATION,
      PRN_STATUS.AWAITING_ACCEPTANCE,
      decideIssuePrn,
      'deduct_total'
    ],
    [
      PRN_STATUS.AWAITING_ACCEPTANCE,
      PRN_STATUS.ACCEPTED,
      decideAcceptPrn,
      'append_accepted'
    ],
    [
      PRN_STATUS.AWAITING_ACCEPTANCE,
      PRN_STATUS.AWAITING_CANCELLATION,
      decideRejectPrn,
      'append_rejected'
    ],
    [
      PRN_STATUS.AWAITING_AUTHORISATION,
      PRN_STATUS.DELETED,
      decideCancelPrnCreation,
      'credit_available'
    ],
    [
      PRN_STATUS.AWAITING_CANCELLATION,
      PRN_STATUS.CANCELLED,
      decideCancelIssuedPrn,
      'credit_full'
    ],
    [
      PRN_STATUS.ACCEPTED,
      PRN_STATUS.CANCELLED,
      decideCancelIssuedPrn,
      'credit_full'
    ]
  ])(
    'maps %s -> %s to its balance decision',
    (currentStatus, newStatus, decide, logOperation) => {
      expect(prnCommandFor(currentStatus, newStatus)).toEqual({
        decide,
        logOperation
      })
    }
  )

  it('has no command for a transition with no balance effect', () => {
    expect(
      prnCommandFor(PRN_STATUS.DRAFT, PRN_STATUS.DISCARDED)
    ).toBeUndefined()
  })
})

describe('applyPrnTransition on commit', () => {
  it('appends the decided event and returns it', async () => {
    const service = serviceWithBalance({ amount: 1000, availableAmount: 1000 })

    const { events } = await applyTransition(
      service,
      buildLogger(),
      PRN_STATUS.DRAFT,
      PRN_STATUS.AWAITING_AUTHORISATION,
      PRN_ACTOR.REPROCESSOR_EXPORTER
    )

    expect(events).toHaveLength(1)
    expect(events[0]?.kind).toBe(LEDGER_EVENT_KIND.PRN_CREATED)
    expect(events[0]?.number).toBe(APPENDED_NUMBER)
  })

  it('logs the operation against the PRN', async () => {
    const service = serviceWithBalance({ amount: 1000, availableAmount: 1000 })
    const logger = buildLogger()

    await applyTransition(
      service,
      logger,
      PRN_STATUS.DRAFT,
      PRN_STATUS.AWAITING_AUTHORISATION,
      PRN_ACTOR.REPROCESSOR_EXPORTER
    )

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('deduct_available'),
        event: expect.objectContaining({
          action: 'waste_balance_updated',
          category: 'database',
          reference: PRN_ID
        })
      })
    )
    const [entry] = logger.info.mock.calls[0]
    expect(entry.message).toContain(PRN_ID)
    expect(entry.message).toContain(String(TONNAGE))
  })
})

describe('applyPrnTransition on rejection', () => {
  it('throws a 400 naming the accreditation when no ledger exists', async () => {
    const service = serviceWithBalance(null)

    await expect(
      applyTransition(
        service,
        buildLogger(),
        PRN_STATUS.DRAFT,
        PRN_STATUS.AWAITING_AUTHORISATION,
        PRN_ACTOR.REPROCESSOR_EXPORTER
      )
    ).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 400 },
      message: `No waste balance found for accreditation: ${ACCREDITATION_ID}`
    })
  })

  it('throws a 409 when the available balance is exhausted on creation', async () => {
    const service = serviceWithBalance({ amount: 500, availableAmount: 0 })

    await expect(
      applyTransition(
        service,
        buildLogger(),
        PRN_STATUS.DRAFT,
        PRN_STATUS.AWAITING_AUTHORISATION,
        PRN_ACTOR.REPROCESSOR_EXPORTER
      )
    ).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 409 },
      message: 'Insufficient available waste balance'
    })
  })

  it('throws a 409 when the total balance is exhausted on issuance', async () => {
    const service = serviceWithBalance({ amount: 0, availableAmount: 500 })

    await expect(
      applyTransition(
        service,
        buildLogger(),
        PRN_STATUS.AWAITING_AUTHORISATION,
        PRN_STATUS.AWAITING_ACCEPTANCE,
        PRN_ACTOR.SIGNATORY
      )
    ).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 409 },
      message: 'Insufficient total waste balance'
    })
  })

  it.each([
    ['acceptance', PRN_STATUS.AWAITING_ACCEPTANCE, PRN_STATUS.ACCEPTED],
    [
      'rejection',
      PRN_STATUS.AWAITING_ACCEPTANCE,
      PRN_STATUS.AWAITING_CANCELLATION
    ]
  ])(
    'throws a 500 on %s when the ledger is missing, as that state is unreachable',
    async (_label, currentStatus, newStatus) => {
      const service = serviceWithBalance(null)

      await expect(
        applyTransition(
          service,
          buildLogger(),
          currentStatus,
          newStatus,
          PRN_ACTOR.PRODUCER
        )
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 500 }
      })
    }
  )
})
