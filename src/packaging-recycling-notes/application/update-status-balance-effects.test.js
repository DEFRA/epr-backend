import { describe, it, expect, vi } from 'vitest'

import {
  applyPrnBalanceCommand,
  prnCommandFor
} from './update-status-balance-effects.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'

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
        buildStreamEvent({
          registrationId: REGISTRATION_ID,
          accreditationId: ACCREDITATION_ID,
          organisationId: ORGANISATION_ID,
          number: SEED_NUMBER,
          closingBalance
        })
      ]
    : []
  return createWasteBalanceService(createInMemoryStreamRepository(events)())
}

const applyTransition = (service, logger, currentStatus, newStatus) =>
  applyPrnBalanceCommand(service, logger, {
    currentStatus,
    newStatus,
    ledgerId,
    prnId: PRN_ID,
    tonnage: TONNAGE,
    createdBy
  })

describe('prnCommandFor', () => {
  it.each([
    [
      PRN_STATUS.DRAFT,
      PRN_STATUS.AWAITING_AUTHORISATION,
      'createPrn',
      'deduct_available'
    ],
    [
      PRN_STATUS.AWAITING_AUTHORISATION,
      PRN_STATUS.AWAITING_ACCEPTANCE,
      'issuePrn',
      'deduct_total'
    ],
    [
      PRN_STATUS.AWAITING_ACCEPTANCE,
      PRN_STATUS.ACCEPTED,
      'acceptPrn',
      'append_accepted'
    ],
    [
      PRN_STATUS.AWAITING_ACCEPTANCE,
      PRN_STATUS.AWAITING_CANCELLATION,
      'rejectPrn',
      'append_rejected'
    ],
    [
      PRN_STATUS.AWAITING_AUTHORISATION,
      PRN_STATUS.DELETED,
      'cancelPrnCreation',
      'credit_available'
    ],
    [
      PRN_STATUS.AWAITING_CANCELLATION,
      PRN_STATUS.CANCELLED,
      'cancelIssuedPrn',
      'credit_full'
    ]
  ])(
    'maps %s -> %s to the %s command',
    (currentStatus, newStatus, method, logOperation) => {
      expect(prnCommandFor(currentStatus, newStatus)).toEqual({
        method,
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

describe('applyPrnBalanceCommand on commit', () => {
  it('appends the decided event and returns it', async () => {
    const service = serviceWithBalance({ amount: 1000, availableAmount: 1000 })

    const events = await applyTransition(
      service,
      buildLogger(),
      PRN_STATUS.DRAFT,
      PRN_STATUS.AWAITING_AUTHORISATION
    )

    expect(events).toHaveLength(1)
    expect(events[0]?.kind).toBe(STREAM_EVENT_KIND.PRN_CREATED)
    expect(events[0]?.number).toBe(APPENDED_NUMBER)
  })

  it('logs the operation against the PRN', async () => {
    const service = serviceWithBalance({ amount: 1000, availableAmount: 1000 })
    const logger = buildLogger()

    await applyTransition(
      service,
      logger,
      PRN_STATUS.DRAFT,
      PRN_STATUS.AWAITING_AUTHORISATION
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

describe('applyPrnBalanceCommand on rejection', () => {
  it('throws a 400 naming the accreditation when no ledger exists', async () => {
    const service = serviceWithBalance(null)

    await expect(
      applyTransition(
        service,
        buildLogger(),
        PRN_STATUS.DRAFT,
        PRN_STATUS.AWAITING_AUTHORISATION
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
        PRN_STATUS.AWAITING_AUTHORISATION
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
        PRN_STATUS.AWAITING_ACCEPTANCE
      )
    ).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 409 },
      message: 'Insufficient total waste balance'
    })
  })
})
