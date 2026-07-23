import { describe, it, expect, vi } from 'vitest'

import {
  PRN_STATUS,
  PRN_ACTOR
} from '#packaging-recycling-notes/domain/model.js'
import { REGULATOR } from '#domain/organisations/model.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import {
  buildAwaitingAuthorisationPrn,
  buildAwaitingAcceptancePrn,
  buildDraftPrn
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'

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

const buildLogger = () => ({
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
const STARTING_TOTAL = 1000
const POST_DEDUCTION_AVAILABLE = 950

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

const buildOrganisationsRepository = () =>
  /** @type {import('#repositories/organisations/port.js').OrganisationsRepository} */ (
    /** @type {unknown} */ ({
      findAccreditationById: vi.fn().mockResolvedValue({
        status: 'approved',
        submittedToRegulator: REGULATOR.EA
      })
    })
  )

/**
 * Stand up the in-memory repositories on the ledger path. The balance's resolved
 * amounts come from the stream's latest closing balance, so the seed's `amount` /
 * `availableAmount` are projected onto a seeded stream event before the act.
 */
const setupRepositories = async ({ prnSeed, balanceSeed }) => {
  const logger = buildLogger()
  const prnFactory = createInMemoryPackagingRecyclingNotesRepository([prnSeed])
  const prnRepository = prnFactory(logger)

  const ledgerRepository = createInMemoryLedgerRepository()()
  await ledgerRepository.appendEvents([
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

  const organisationsRepository = buildOrganisationsRepository()
  const prnEvents = { onCancelled: vi.fn().mockResolvedValue(undefined) }

  return {
    logger,
    prnRepository,
    ledgerRepository,
    organisationsRepository,
    prnEvents
  }
}

const issueUser = { id: 'user-789', name: 'Test User' }

const findWasteBalanceLog = (logger) =>
  logger.info.mock.calls
    .map(([entry]) => entry)
    .find((entry) => entry?.event?.action === 'waste_balance_updated')

const expectWasteBalanceLog = (
  logger,
  { operation, fromStatus, toStatus, tonnage }
) => {
  const entry = findWasteBalanceLog(logger)
  expect(entry).toBeDefined()
  expect(entry.event.action).toBe('waste_balance_updated')
  expect(entry.event.category).toBe('database')
  expect(entry.event.reference).toBe(PRN_ID)
  expect(entry.message).toContain(operation)
  expect(entry.message).toContain(PRN_ID)
  expect(entry.message).toContain(fromStatus)
  expect(entry.message).toContain(toStatus)
  expect(entry.message).toContain(String(tonnage))
}

describe('updatePrnStatus system logging on successful balance update', () => {
  it('logs deduct_available when a PRN is created from draft', async () => {
    const {
      logger,
      prnRepository,
      ledgerRepository,
      organisationsRepository,
      prnEvents
    } = await setupRepositories({
      prnSeed: buildDraftPrn(PRN_BASE),
      balanceSeed: buildBalanceSeed()
    })

    await updatePrnStatus({
      prnRepository,
      ledgerRepository,
      organisationsRepository,
      prnEvents,
      logger,
      id: PRN_ID,
      organisationId: ORG_ID,
      accreditationId: ACC_ID,
      registrationId: REG_ID,
      newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
      user: issueUser
    })

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expectWasteBalanceLog(logger, {
      operation: 'deduct_available',
      fromStatus: PRN_STATUS.DRAFT,
      toStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      tonnage: TONNAGE
    })
  })

  it('logs deduct_total when a PRN is issued', async () => {
    const {
      logger,
      prnRepository,
      ledgerRepository,
      organisationsRepository,
      prnEvents
    } = await setupRepositories({
      prnSeed: buildAwaitingAuthorisationPrn(PRN_BASE),
      balanceSeed: buildBalanceSeed({
        availableAmount: POST_DEDUCTION_AVAILABLE
      })
    })

    await updatePrnStatus({
      prnRepository,
      ledgerRepository,
      organisationsRepository,
      prnEvents,
      logger,
      id: PRN_ID,
      organisationId: ORG_ID,
      accreditationId: ACC_ID,
      registrationId: REG_ID,
      newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      actor: PRN_ACTOR.SIGNATORY,
      user: issueUser
    })

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expectWasteBalanceLog(logger, {
      operation: 'deduct_total',
      fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      toStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      tonnage: TONNAGE
    })
  })

  it('logs credit_available when a pending PRN is deleted', async () => {
    const {
      logger,
      prnRepository,
      ledgerRepository,
      organisationsRepository,
      prnEvents
    } = await setupRepositories({
      prnSeed: buildAwaitingAuthorisationPrn(PRN_BASE),
      balanceSeed: buildBalanceSeed({
        availableAmount: POST_DEDUCTION_AVAILABLE
      })
    })

    await updatePrnStatus({
      prnRepository,
      ledgerRepository,
      organisationsRepository,
      prnEvents,
      logger,
      id: PRN_ID,
      organisationId: ORG_ID,
      accreditationId: ACC_ID,
      registrationId: REG_ID,
      newStatus: PRN_STATUS.DELETED,
      actor: PRN_ACTOR.SIGNATORY,
      user: issueUser
    })

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expectWasteBalanceLog(logger, {
      operation: 'credit_available',
      fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      toStatus: PRN_STATUS.DELETED,
      tonnage: TONNAGE
    })
  })

  it('logs credit_full when an issued PRN cancellation completes', async () => {
    const awaitingCancellationSeed = buildAwaitingAcceptancePrn({
      ...PRN_BASE,
      status:
        /** @type {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote['status']} */ ({
          currentStatus: PRN_STATUS.AWAITING_CANCELLATION
        })
    })
    const {
      logger,
      prnRepository,
      ledgerRepository,
      organisationsRepository,
      prnEvents
    } = await setupRepositories({
      prnSeed: awaitingCancellationSeed,
      balanceSeed: buildBalanceSeed({
        availableAmount: POST_DEDUCTION_AVAILABLE,
        amount: POST_DEDUCTION_AVAILABLE
      })
    })

    await updatePrnStatus({
      prnRepository,
      ledgerRepository,
      organisationsRepository,
      prnEvents,
      logger,
      id: PRN_ID,
      organisationId: ORG_ID,
      accreditationId: ACC_ID,
      registrationId: REG_ID,
      newStatus: PRN_STATUS.CANCELLED,
      actor: PRN_ACTOR.SIGNATORY,
      user: issueUser
    })

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expectWasteBalanceLog(logger, {
      operation: 'credit_full',
      fromStatus: PRN_STATUS.AWAITING_CANCELLATION,
      toStatus: PRN_STATUS.CANCELLED,
      tonnage: TONNAGE
    })
  })

  it('does not log a balance update for a discard write with no balance effect', async () => {
    const {
      logger,
      prnRepository,
      ledgerRepository,
      organisationsRepository,
      prnEvents
    } = await setupRepositories({
      prnSeed: buildDraftPrn(PRN_BASE),
      balanceSeed: buildBalanceSeed()
    })

    await updatePrnStatus({
      prnRepository,
      ledgerRepository,
      organisationsRepository,
      prnEvents,
      logger,
      id: PRN_ID,
      organisationId: ORG_ID,
      accreditationId: ACC_ID,
      registrationId: REG_ID,
      newStatus: PRN_STATUS.DISCARDED,
      actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
      user: issueUser
    })

    expect(findWasteBalanceLog(logger)).toBeUndefined()
  })
})
