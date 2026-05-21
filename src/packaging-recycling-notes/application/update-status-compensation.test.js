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
  buildAwaitingAcceptancePrn,
  buildDraftPrn
} from '#packaging-recycling-notes/repository/contract/test-data.js'

vi.mock('./metrics.js', () => ({
  prnMetrics: {
    recordStatusTransition: vi.fn().mockResolvedValue(undefined)
  }
}))

const { updatePrnStatus } = await import('./update-status.js')

const buildLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn()
})

const PRN_ID = '507f1f77bcf86cd799439011'
const ORG_ID = 'org-123'
const ACC_ID = 'acc-456'
const TONNAGE = 50
const STARTING_TOTAL = 1000
const POST_DEDUCTION_AVAILABLE = 950

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
  organisationId: ORG_ID,
  amount: STARTING_TOTAL,
  availableAmount: STARTING_TOTAL,
  transactions: [],
  version: 0,
  schemaVersion: 1,
  canonicalSource: 'embedded',
  ...overrides
})

const buildOrganisationsRepository = () => ({
  findAccreditationById: vi.fn().mockResolvedValue({
    submittedToRegulator: REGULATOR.EA
  })
})

const setupRepositories = ({ prnSeed, balanceSeed }) => {
  const logger = buildLogger()
  const prnFactory = createInMemoryPackagingRecyclingNotesRepository([prnSeed])
  const prnRepository = /** @type {any} */ (prnFactory(logger))

  const wasteFactory = createInMemoryWasteBalancesRepository([balanceSeed], {
    streamRepository: createInMemoryStreamRepository()()
  })
  const wasteBalancesRepository = /** @type {any} */ (wasteFactory())

  const organisationsRepository = buildOrganisationsRepository()

  return {
    logger,
    prnRepository,
    wasteBalancesRepository,
    organisationsRepository
  }
}

const issueUser = { id: 'user-789', name: 'Test User' }

const expectCompensationSuccessLog = (
  logger,
  { forwardError, fromStatus, toStatus }
) => {
  expect(logger.warn).toHaveBeenCalledTimes(1)
  const [successLog] = logger.warn.mock.calls[0]
  expect(successLog.err).toBe(forwardError)
  expect(successLog.event.action).toBe('compensation_success')
  expect(successLog.event.reference).toBe(PRN_ID)
  expect(successLog.message).toContain(PRN_ID)
  expect(successLog.message).toContain(fromStatus)
  expect(successLog.message).toContain(toStatus)
}

describe('updatePrnStatus compensation', () => {
  describe('post-CAS rollback when balance side-effect fails', () => {
    it('reverts an issuance to awaiting_authorisation if the total-balance debit throws', async () => {
      const {
        logger,
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository
      } = setupRepositories({
        prnSeed: buildAwaitingAuthorisationPrn(PRN_BASE),
        balanceSeed: buildBalanceSeed({
          availableAmount: POST_DEDUCTION_AVAILABLE
        })
      })

      const debitError = new Error('simulated balance debit failure')
      wasteBalancesRepository.deductTotalBalanceForPrnIssue = vi
        .fn()
        .mockRejectedValue(debitError)

      await expect(
        updatePrnStatus({
          prnRepository,
          wasteBalancesRepository,
          organisationsRepository,
          logger,
          id: PRN_ID,
          organisationId: ORG_ID,
          accreditationId: ACC_ID,
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          actor: PRN_ACTOR.SIGNATORY,
          user: issueUser
        })
      ).rejects.toBe(debitError)

      const refetched = await prnRepository.findById(PRN_ID)
      expect(refetched.status.currentStatus).toBe(
        PRN_STATUS.AWAITING_AUTHORISATION
      )
      expect(refetched.prnNumber).toBeUndefined()
      expect(refetched.status.issued).toBeUndefined()

      expect(logger.error).not.toHaveBeenCalled()
      expectCompensationSuccessLog(logger, {
        forwardError: debitError,
        fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        toStatus: PRN_STATUS.AWAITING_ACCEPTANCE
      })
    })

    it('reverts a pending-cancellation (DELETED) if the available-balance credit throws', async () => {
      const {
        logger,
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository
      } = setupRepositories({
        prnSeed: buildAwaitingAuthorisationPrn(PRN_BASE),
        balanceSeed: buildBalanceSeed({
          availableAmount: POST_DEDUCTION_AVAILABLE
        })
      })

      const creditError = new Error('simulated credit failure')
      wasteBalancesRepository.creditAvailableBalanceForPrnCancellation = vi
        .fn()
        .mockRejectedValue(creditError)

      await expect(
        updatePrnStatus({
          prnRepository,
          wasteBalancesRepository,
          organisationsRepository,
          logger,
          id: PRN_ID,
          organisationId: ORG_ID,
          accreditationId: ACC_ID,
          newStatus: PRN_STATUS.DELETED,
          actor: PRN_ACTOR.SIGNATORY,
          user: issueUser
        })
      ).rejects.toBe(creditError)

      const refetched = await prnRepository.findById(PRN_ID)
      expect(refetched.status.currentStatus).toBe(
        PRN_STATUS.AWAITING_AUTHORISATION
      )
      expect(refetched.status.deleted).toBeUndefined()
      expect(refetched.status.cancelled).toBeUndefined()

      expect(logger.error).not.toHaveBeenCalled()
      expectCompensationSuccessLog(logger, {
        forwardError: creditError,
        fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        toStatus: PRN_STATUS.DELETED
      })
    })

    it('reverts an issued cancellation to awaiting_cancellation if the full-balance credit throws', async () => {
      const awaitingCancellationSeed = buildAwaitingAcceptancePrn({
        ...PRN_BASE,
        status: { currentStatus: PRN_STATUS.AWAITING_CANCELLATION }
      })
      const {
        logger,
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository
      } = setupRepositories({
        prnSeed: awaitingCancellationSeed,
        balanceSeed: buildBalanceSeed({
          availableAmount: POST_DEDUCTION_AVAILABLE,
          amount: POST_DEDUCTION_AVAILABLE
        })
      })

      const creditError = new Error('simulated full-credit failure')
      wasteBalancesRepository.creditFullBalanceForIssuedPrnCancellation = vi
        .fn()
        .mockRejectedValue(creditError)

      await expect(
        updatePrnStatus({
          prnRepository,
          wasteBalancesRepository,
          organisationsRepository,
          logger,
          id: PRN_ID,
          organisationId: ORG_ID,
          accreditationId: ACC_ID,
          newStatus: PRN_STATUS.CANCELLED,
          actor: PRN_ACTOR.SIGNATORY,
          user: issueUser
        })
      ).rejects.toBe(creditError)

      const refetched = await prnRepository.findById(PRN_ID)
      expect(refetched.status.currentStatus).toBe(
        PRN_STATUS.AWAITING_CANCELLATION
      )
      expect(refetched.status.cancelled).toBeUndefined()

      expect(logger.error).not.toHaveBeenCalled()
      expectCompensationSuccessLog(logger, {
        forwardError: creditError,
        fromStatus: PRN_STATUS.AWAITING_CANCELLATION,
        toStatus: PRN_STATUS.CANCELLED
      })
    })
  })

  describe('pre-flight credit-back when creation PRN write fails', () => {
    it('credits available balance back if the PRN write throws after pre-flight debit', async () => {
      const {
        logger,
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository
      } = setupRepositories({
        prnSeed: buildDraftPrn(PRN_BASE),
        balanceSeed: buildBalanceSeed()
      })

      const writeError = new Error('simulated PRN write failure')
      prnRepository.updateStatus = vi.fn().mockRejectedValue(writeError)

      await expect(
        updatePrnStatus({
          prnRepository,
          wasteBalancesRepository,
          organisationsRepository,
          logger,
          id: PRN_ID,
          organisationId: ORG_ID,
          accreditationId: ACC_ID,
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
          user: issueUser
        })
      ).rejects.toBe(writeError)

      const balance =
        await wasteBalancesRepository.findByAccreditationId(ACC_ID)
      expect(balance.amount).toBe(STARTING_TOTAL)
      expect(balance.availableAmount).toBe(STARTING_TOTAL)

      expect(logger.error).not.toHaveBeenCalled()
      expectCompensationSuccessLog(logger, {
        forwardError: writeError,
        fromStatus: PRN_STATUS.DRAFT,
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION
      })
    })
  })

  describe('compensation-failure path', () => {
    it('rethrows the original forward error and logs both errors when rollback also throws', async () => {
      const {
        logger,
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository
      } = setupRepositories({
        prnSeed: buildAwaitingAuthorisationPrn(PRN_BASE),
        balanceSeed: buildBalanceSeed({
          availableAmount: POST_DEDUCTION_AVAILABLE
        })
      })

      const forwardError = new Error('simulated balance debit failure')
      wasteBalancesRepository.deductTotalBalanceForPrnIssue = vi
        .fn()
        .mockRejectedValue(forwardError)

      const compensationError = new Error('simulated rollback failure')
      prnRepository.rollbackIssuance = vi
        .fn()
        .mockRejectedValue(compensationError)

      await expect(
        updatePrnStatus({
          prnRepository,
          wasteBalancesRepository,
          organisationsRepository,
          logger,
          id: PRN_ID,
          organisationId: ORG_ID,
          accreditationId: ACC_ID,
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          actor: PRN_ACTOR.SIGNATORY,
          user: issueUser
        })
      ).rejects.toBe(forwardError)

      expect(logger.error).toHaveBeenCalledTimes(2)
      const [forwardLog] = logger.error.mock.calls[0]
      const [compensationLog] = logger.error.mock.calls[1]

      expect(forwardLog.err).toBe(forwardError)
      expect(forwardLog.event.action).toBe('compensation_failure')
      expect(forwardLog.event.reference).toBe(PRN_ID)
      expect(forwardLog.message).toContain(PRN_ID)
      expect(forwardLog.message).toContain(PRN_STATUS.AWAITING_AUTHORISATION)
      expect(forwardLog.message).toContain(PRN_STATUS.AWAITING_ACCEPTANCE)

      expect(compensationLog.err).toBe(compensationError)
      expect(compensationLog.event.action).toBe('compensation_failure')
      expect(compensationLog.event.reference).toBe(PRN_ID)
      expect(compensationLog.message).toContain(PRN_ID)
      expect(compensationLog.message).toContain(
        PRN_STATUS.AWAITING_AUTHORISATION
      )
      expect(compensationLog.message).toContain(PRN_STATUS.AWAITING_ACCEPTANCE)

      expect(logger.warn).not.toHaveBeenCalled()
    })
  })
})

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
      wasteBalancesRepository,
      organisationsRepository
    } = setupRepositories({
      prnSeed: buildDraftPrn(PRN_BASE),
      balanceSeed: buildBalanceSeed()
    })

    await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository,
      logger,
      id: PRN_ID,
      organisationId: ORG_ID,
      accreditationId: ACC_ID,
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
      wasteBalancesRepository,
      organisationsRepository
    } = setupRepositories({
      prnSeed: buildAwaitingAuthorisationPrn(PRN_BASE),
      balanceSeed: buildBalanceSeed({
        availableAmount: POST_DEDUCTION_AVAILABLE
      })
    })

    await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository,
      logger,
      id: PRN_ID,
      organisationId: ORG_ID,
      accreditationId: ACC_ID,
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
      wasteBalancesRepository,
      organisationsRepository
    } = setupRepositories({
      prnSeed: buildAwaitingAuthorisationPrn(PRN_BASE),
      balanceSeed: buildBalanceSeed({
        availableAmount: POST_DEDUCTION_AVAILABLE
      })
    })

    await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository,
      logger,
      id: PRN_ID,
      organisationId: ORG_ID,
      accreditationId: ACC_ID,
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
      status: { currentStatus: PRN_STATUS.AWAITING_CANCELLATION }
    })
    const {
      logger,
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository
    } = setupRepositories({
      prnSeed: awaitingCancellationSeed,
      balanceSeed: buildBalanceSeed({
        availableAmount: POST_DEDUCTION_AVAILABLE,
        amount: POST_DEDUCTION_AVAILABLE
      })
    })

    await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository,
      logger,
      id: PRN_ID,
      organisationId: ORG_ID,
      accreditationId: ACC_ID,
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

  it('does not log when no balance side effect occurs', async () => {
    const awaitingAcceptanceSeed = buildAwaitingAcceptancePrn(PRN_BASE)
    const {
      logger,
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository
    } = setupRepositories({
      prnSeed: awaitingAcceptanceSeed,
      balanceSeed: buildBalanceSeed({
        availableAmount: POST_DEDUCTION_AVAILABLE,
        amount: POST_DEDUCTION_AVAILABLE
      })
    })

    await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository,
      logger,
      id: PRN_ID,
      organisationId: ORG_ID,
      accreditationId: ACC_ID,
      newStatus: PRN_STATUS.AWAITING_CANCELLATION,
      actor: PRN_ACTOR.PRODUCER,
      user: issueUser
    })

    expect(findWasteBalanceLog(logger)).toBeUndefined()
  })
})
