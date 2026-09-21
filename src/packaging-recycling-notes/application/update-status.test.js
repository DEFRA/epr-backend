import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  PRN_STATUS,
  PRN_ACTOR,
  PRN_STATUS_TRANSITIONS,
  StatusConflictError,
  UnauthorisedTransitionError
} from '#packaging-recycling-notes/domain/model.js'
import { PRN_TRANSITION_EFFECTS } from '#packaging-recycling-notes/domain/prn-transition.js'
import { REGULATOR, ORGANISATION_STATUS } from '#domain/organisations/model.js'
import {
  LEDGER_EVENT_KIND,
  POOL
} from '#waste-balances/repository/ledger-schema.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildOrganisation,
  buildAccreditation
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID,
  DEFAULT_REPORT_START_DATE
} from '#reports/repository/contract/test-data.js'
import { createOnPrnCancelled } from '#reports/application/prn-cancellation-events.js'
import { createDraftReport } from '#vite/helpers/create-draft-report.js'
import { createMockLogger } from '#test/mock-logger.js'

const mockRecordStatusTransition = vi.fn()
const mockOnCancelled = vi.fn()

vi.mock('./metrics.js', () => ({
  prnMetrics: {
    recordStatusTransition: (...args) => mockRecordStatusTransition(...args)
  }
}))

const { updatePrnStatus, FOLLOW_RAISE_POOL_STATUSES } =
  await import('./update-status.js')

const ORG_ID = '507f1f77bcf86cd799439aaa'
const ACC_ID = 'acc-456'
const REG_ID = 'reg-789'
const PRN_ID = '507f1f77bcf86cd799439011'
const USER = { id: 'user-789', name: 'Test User' }
const EVENT_AT = new Date('2026-02-01T12:00:00.000Z')

/**
 * @param {Object} [overrides]
 * @returns {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote}
 */
const buildPrn = (overrides = {}) => ({
  id: PRN_ID,
  schemaVersion: 2,
  version: 1,
  registrationId: REG_ID,
  organisation: { id: ORG_ID, name: 'Test Reprocessor' },
  accreditation: {
    id: ACC_ID,
    accreditationNumber: 'ACC-1',
    accreditationYear: 2026,
    material: 'plastic',
    submittedToRegulator: REGULATOR.EA
  },
  tonnage: 100,
  isExport: false,
  isDecemberWaste: false,
  obligationYear: 2026,
  status: {
    currentStatus: PRN_STATUS.DRAFT,
    currentStatusAt: EVENT_AT,
    history: []
  },
  createdAt: EVENT_AT,
  createdBy: USER,
  updatedAt: EVENT_AT,
  updatedBy: USER,
  ...overrides
})

/**
 * Seed an opening waste balance as a single stream event. `currentBalance`
 * resolves the latest event's closing balance, so this is the balance the
 * transition opens against. December fields are seeded only when supplied, so
 * a general balance stays free of them.
 *
 * @param {{ amount: number, availableAmount: number, decemberAmount?: number, decemberAvailableAmount?: number }} closingBalance
 * @returns {import('#waste-balances/repository/ledger-schema.js').LedgerEvent}
 */
const buildOpeningBalanceEvent = ({
  amount,
  availableAmount,
  decemberAmount,
  decemberAvailableAmount
}) => ({
  registrationId: REG_ID,
  accreditationId: ACC_ID,
  organisationId: ORG_ID,
  number: 1,
  kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
  payload: {
    summaryLogId: 'seed-summary-log',
    creditTotal: amount,
    ...(decemberAmount !== undefined && { decemberCreditTotal: decemberAmount })
  },
  openingBalance: { amount: 0, availableAmount: 0 },
  closingBalance: {
    amount,
    availableAmount,
    ...(decemberAmount !== undefined && {
      decemberAmount,
      decemberAvailableAmount
    })
  },
  createdAt: EVENT_AT,
  createdBy: USER
})

/**
 * A PRN ledger event (raise or reversal) for the PRN under test, carrying the
 * `prnId` the reversal reads its pool off and the `pool` the raise resolved. The
 * caller supplies the opening and closing balances so a realistic raised state
 * can be seeded ahead of a cancellation.
 *
 * @param {{
 *   kind: import('#waste-balances/repository/ledger-schema.js').LedgerEventKind,
 *   number: number,
 *   openingBalance: import('#waste-balances/repository/ledger-schema.js').LedgerBalanceSnapshot,
 *   closingBalance: import('#waste-balances/repository/ledger-schema.js').LedgerBalanceSnapshot,
 *   pool?: import('#waste-balances/repository/ledger-schema.js').Pool,
 *   amount?: number
 * }} params
 * @returns {import('#waste-balances/repository/ledger-schema.js').LedgerEvent}
 */
const buildPrnLedgerEvent = ({
  kind,
  number,
  openingBalance,
  closingBalance,
  pool,
  amount = 100
}) => ({
  registrationId: REG_ID,
  accreditationId: ACC_ID,
  organisationId: ORG_ID,
  number,
  kind,
  payload: { prnId: PRN_ID, amount, ...(pool !== undefined && { pool }) },
  openingBalance,
  closingBalance,
  createdAt: EVENT_AT,
  createdBy: USER
})

/**
 * An organisation carrying the accreditation under test, with `ORG_ID` and
 * `ACC_ID` pinned so the seeded PRN's links resolve. `withAccreditation: false`
 * removes the accreditation so issuance can't find it.
 *
 * @param {Object} [options]
 * @param {Object} [options.accreditation] - accreditation field overrides
 * @param {boolean} [options.withAccreditation]
 */
const buildOrgWithAccreditation = ({
  accreditation = {},
  withAccreditation = true
} = {}) => ({
  // `status` is derived from `statusHistory` on read; the seeded value only
  // satisfies the constructor's Organisation type.
  status: ORGANISATION_STATUS.APPROVED,
  ...buildOrganisation({
    id: ORG_ID,
    accreditations: withAccreditation
      ? [
          buildAccreditation({
            id: ACC_ID,
            accreditationYear: 2026,
            submittedToRegulator: REGULATOR.EA,
            statusHistory: [
              { status: 'created', updatedAt: '2024-01-01' },
              { status: 'approved', updatedAt: '2024-02-01' }
            ],
            ...accreditation
          })
        ]
      : []
  })
})

/**
 * Wire up the three real in-memory adapters for one case. The PRN doc and the
 * waste balance are seeded; the organisation always carries the accreditation
 * unless `withAccreditation: false` removes it.
 *
 * @param {Object} [options]
 * @param {Object} [options.prn] - PRN to seed, or omitted for an empty repo
 * @param {Object[]} [options.prns] - PRNs to seed, taking precedence over `prn`
 * @param {{ amount: number, availableAmount: number, decemberAmount?: number, decemberAvailableAmount?: number }} [options.balance] - opening balance, or omitted for none
 * @param {import('#waste-balances/repository/ledger-schema.js').LedgerEvent[]} [options.ledgerEvents] - raw ledger events to seed, taking precedence over `balance` (for a raised-then-cancelled sequence)
 * @param {Object} [options.accreditation] - accreditation field overrides
 * @param {boolean} [options.withAccreditation]
 */
const seedRepositories = ({
  prn,
  prns,
  balance,
  ledgerEvents,
  accreditation,
  withAccreditation = true
} = {}) => {
  const prnRepository = createInMemoryPackagingRecyclingNotesRepository(
    prns ?? (prn ? [prn] : [])
  )(createMockLogger())
  const ledgerRepository = createInMemoryLedgerRepository(
    ledgerEvents ?? (balance ? [buildOpeningBalanceEvent(balance)] : [])
  )()
  const wasteBalanceService = createWasteBalanceService(ledgerRepository)
  const organisationsRepository = createInMemoryOrganisationsRepository([
    buildOrgWithAccreditation({ accreditation, withAccreditation })
  ])()
  return {
    prnRepository,
    ledgerRepository,
    wasteBalanceService,
    organisationsRepository
  }
}

const readBalance = (wasteBalanceService) =>
  wasteBalanceService.currentBalance({
    organisationId: ORG_ID,
    registrationId: REG_ID,
    accreditationId: ACC_ID
  })

const buildSystemLogsRepository = () => ({
  insert: vi.fn().mockResolvedValue(undefined),
  insertMany: vi.fn().mockResolvedValue(undefined),
  find: vi.fn(),
  findSummaryLogSubmitActors: vi.fn()
})

const callUpdate = (overrides) =>
  updatePrnStatus({
    logger: createMockLogger(),
    id: PRN_ID,
    organisationId: ORG_ID,
    registrationId: REG_ID,
    accreditationId: ACC_ID,
    user: USER,
    prnEvents: { onCancelled: mockOnCancelled },
    ...overrides
  })

describe('updatePrnStatus', () => {
  beforeEach(() => {
    mockRecordStatusTransition.mockResolvedValue(undefined)
    mockOnCancelled.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('PRN lookup and tenancy', () => {
    it('throws not found when the PRN does not exist', async () => {
      const repositories = seedRepositories()

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow('PRN not found')
    })

    it('throws not found when the PRN belongs to a different organisation', async () => {
      const repositories = seedRepositories({ prn: buildPrn() })

      await expect(
        callUpdate({
          ...repositories,
          organisationId: '507f1f77bcf86cd799439bbb',
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow('PRN not found')
    })

    it('throws not found when the PRN belongs to a different accreditation', async () => {
      const repositories = seedRepositories({ prn: buildPrn() })

      await expect(
        callUpdate({
          ...repositories,
          accreditationId: 'different-acc',
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow('PRN not found')
    })
  })

  describe('the waste-balance write boundary', () => {
    // Tonnage is validated positive at the route and in the PRN schema, so a
    // PRN that reaches the write without one is corruption. The deciders test
    // sufficiency with `<`, which a non-positive amount passes, so the guard
    // has to refuse before the balance is decided against. `NaN` passes that
    // check too, and is the only value that reaches it from the wrong side.
    it.each([0, -100, NaN])(
      'refuses a tonnage of %s as a broken invariant, appending nothing',
      async (tonnage) => {
        const repositories = seedRepositories({
          prn: buildPrn({ tonnage }),
          balance: { amount: 1000, availableAmount: 1000 }
        })

        await expect(
          callUpdate({
            ...repositories,
            newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            actor: PRN_ACTOR.REPROCESSOR_EXPORTER
          })
        ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 500 } })

        expect(
          await readBalance(repositories.wasteBalanceService)
        ).toMatchObject({ amount: 1000, availableAmount: 1000 })
      }
    )
  })

  describe('transition rules', () => {
    it('throws StatusConflictError when the transition is not permitted', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        })
      })

      // DRAFT can only reach AWAITING_AUTHORISATION, never AWAITING_ACCEPTANCE
      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow(StatusConflictError)
    })

    it('throws UnauthorisedTransitionError when the actor may not perform the transition', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
            history: []
          }
        })
      })

      // Only the producer may accept; a reprocessor/exporter may not
      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.ACCEPTED,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow(UnauthorisedTransitionError)
    })
  })

  describe('creating a PRN (draft to awaiting authorisation)', () => {
    it('ringfences the available balance and advances the PRN', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        balance: { amount: 1000, availableAmount: 1000 }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER
      })

      const reread = await repositories.prnRepository.findById(PRN_ID)
      expect(reread?.status.currentStatus).toBe(
        PRN_STATUS.AWAITING_AUTHORISATION
      )
      expect(reread?.version).toBe(2)

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        { amount: 1000, availableAmount: 900 }
      )
    })

    it('allows creation when the tonnage equals the available balance exactly', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        balance: { amount: 500, availableAmount: 100 }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER
      })

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        { amount: 500, availableAmount: 0 }
      )
    })

    it('throws conflict and leaves the balance untouched when the tonnage exceeds the available balance', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        balance: { amount: 500, availableAmount: 50 }
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow('Insufficient available waste balance')

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        { amount: 500, availableAmount: 50 }
      )
    })

    it('throws when creating a PRN with no waste balance', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        })
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow('No waste balance found for accreditation: acc-456')
    })

    it('rejects creation when the available balance is exhausted', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 1,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        balance: { amount: 500, availableAmount: 0 }
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow('Insufficient available waste balance')
    })
  })

  describe('issuing a PRN (awaiting authorisation to awaiting acceptance)', () => {
    it('generates a PRN number and deducts the total balance when issuing', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 75,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        balance: { amount: 1000, availableAmount: 1000 }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY
      })

      const reread = await repositories.prnRepository.findById(PRN_ID)
      expect(reread?.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
      expect(reread?.prnNumber).toMatch(/^ER26\d{5}$/)

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        { amount: 925, availableAmount: 1000 }
      )
    })

    it('throws conflict and leaves the balance untouched when the tonnage exceeds the total balance', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        balance: { amount: 50, availableAmount: 200 }
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          actor: PRN_ACTOR.SIGNATORY
        })
      ).rejects.toThrow('Insufficient total waste balance')

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        { amount: 50, availableAmount: 200 }
      )
    })

    it('throws when issuing a PRN with no waste balance', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        })
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          actor: PRN_ACTOR.SIGNATORY
        })
      ).rejects.toThrow('No waste balance found for accreditation: acc-456')
    })

    it('rejects issuance when the total balance is exhausted', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 1,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        balance: { amount: 0, availableAmount: 200 }
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          actor: PRN_ACTOR.SIGNATORY
        })
      ).rejects.toThrow('Insufficient total waste balance')
    })

    it('throws when the accreditation cannot be found when issuing', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        balance: { amount: 1000, availableAmount: 1000 },
        withAccreditation: false
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          actor: PRN_ACTOR.SIGNATORY
        })
      ).rejects.toThrow()
    })
  })

  describe('accepting a PRN (awaiting acceptance to accepted)', () => {
    it('carries a December PRN into the following obligation year when accepted with that override', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 75,
          isExport: true,
          isDecemberWaste: true,
          status: {
            currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
            history: []
          }
        }),
        balance: {
          amount: 1000,
          availableAmount: 1000,
          decemberAmount: 300,
          decemberAvailableAmount: 300
        },
        accreditation: { wasteProcessingType: 'exporter' }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.ACCEPTED,
        actor: PRN_ACTOR.PRODUCER,
        obligationYear: 2027
      })

      const reread = await repositories.prnRepository.findById(PRN_ID)
      expect(reread?.obligationYear).toBe(2027)

      expect(mockRecordStatusTransition).toHaveBeenCalledWith({
        fromStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        toStatus: PRN_STATUS.ACCEPTED,
        material: 'plastic',
        isExport: true,
        isDecemberWaste: true,
        obligationYearCarriedForward: true
      })
    })
  })

  describe('discarding a draft PRN', () => {
    it('discards at the provided timestamp without touching the balance', async () => {
      const explicitTimestamp = new Date('2026-01-15T12:00:00Z')
      const repositories = seedRepositories({
        prn: buildPrn({
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        balance: { amount: 1000, availableAmount: 1000 }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.DISCARDED,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
        updatedAt: explicitTimestamp
      })

      const reread = await repositories.prnRepository.findById(PRN_ID)
      expect(reread?.status.currentStatus).toBe(PRN_STATUS.DISCARDED)
      expect(reread?.status.currentStatusAt).toEqual(explicitTimestamp)
      expect(reread?.version).toBe(2)

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        { amount: 1000, availableAmount: 1000 }
      )
    })

    it('throws when the discard write reports no updated PRN', async () => {
      const prn = buildPrn({
        status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
      })

      await expect(
        callUpdate({
          // A successful findById guarantees the document exists, so the real
          // twin's updateStatus never returns null; this double exercises the
          // defensive guard.
          prnRepository: {
            findById: vi.fn().mockResolvedValue(prn),
            updateStatus: vi.fn().mockResolvedValue(null)
          },
          ledgerRepository: createInMemoryLedgerRepository()(),
          organisationsRepository: {},
          newStatus: PRN_STATUS.DISCARDED,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow('Failed to update PRN status')
    })
  })

  describe('cancelling an issued PRN (awaiting cancellation to cancelled)', () => {
    it('credits the full balance when the cancellation completes', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 60,
          status: {
            currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
            issued: { at: EVENT_AT, by: USER },
            history: []
          }
        }),
        balance: { amount: 440, availableAmount: 940 }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.CANCELLED,
        actor: PRN_ACTOR.SIGNATORY
      })

      const reread = await repositories.prnRepository.findById(PRN_ID)
      expect(reread?.status.currentStatus).toBe(PRN_STATUS.CANCELLED)

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        { amount: 500, availableAmount: 1000 }
      )
    })

    it('marks the active report for the PRN issuance period stale when the cancellation completes', async () => {
      const reportsRepositoryFactory = createInMemoryReportsRepository()
      const reportId = await createDraftReport(reportsRepositoryFactory())

      const issuedAt = new Date(`${DEFAULT_REPORT_START_DATE}T00:00:00.000Z`)
      const prnRepository = createInMemoryPackagingRecyclingNotesRepository([
        buildPrn({
          organisation: { id: DEFAULT_ORG_ID, name: 'Test Reprocessor' },
          registrationId: DEFAULT_REG_ID,
          status: {
            currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
            issued: { at: issuedAt, by: USER },
            history: []
          }
        })
      ])(createMockLogger())
      const ledgerRepository = createInMemoryLedgerRepository([
        {
          registrationId: DEFAULT_REG_ID,
          accreditationId: ACC_ID,
          organisationId: DEFAULT_ORG_ID,
          number: 1,
          kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
          payload: { summaryLogId: 'seed-summary-log', creditTotal: 440 },
          openingBalance: { amount: 0, availableAmount: 0 },
          closingBalance: { amount: 440, availableAmount: 940 },
          createdAt: issuedAt,
          createdBy: USER
        }
      ])()
      const organisationsRepository = createInMemoryOrganisationsRepository([
        buildOrgWithAccreditation()
      ])()

      await updatePrnStatus({
        logger: createMockLogger(),
        id: PRN_ID,
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        accreditationId: ACC_ID,
        user: USER,
        prnRepository,
        ledgerRepository,
        organisationsRepository,
        prnEvents: {
          onCancelled: createOnPrnCancelled({
            reportsRepository: reportsRepositoryFactory(),
            systemLogsRepository: buildSystemLogsRepository()
          })
        },
        newStatus: PRN_STATUS.CANCELLED,
        actor: PRN_ACTOR.SIGNATORY
      })

      const updatedReport =
        await reportsRepositoryFactory().findReportById(reportId)
      expect(updatedReport.stale).toEqual({
        prnCancelled: {
          occurredAt: expect.any(String),
          prnId: PRN_ID
        }
      })
    })

    it('resolves with the updated PRN and logs the error when the cancellation notification fails', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 60,
          status: {
            currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
            issued: { at: EVENT_AT, by: USER },
            history: []
          }
        }),
        balance: { amount: 440, availableAmount: 940 }
      })
      const logger = createMockLogger()
      const notifyError = new Error('reports repository unavailable')
      mockOnCancelled.mockRejectedValueOnce(notifyError)

      const updatedPrn = await callUpdate({
        ...repositories,
        logger,
        newStatus: PRN_STATUS.CANCELLED,
        actor: PRN_ACTOR.SIGNATORY
      })

      expect(updatedPrn.status.currentStatus).toBe(PRN_STATUS.CANCELLED)
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: notifyError })
      )

      const reread = await repositories.prnRepository.findById(PRN_ID)
      expect(reread?.status.currentStatus).toBe(PRN_STATUS.CANCELLED)
    })

    it('throws when cancelling an issued PRN with no waste balance', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 60,
          status: {
            currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
            history: []
          }
        })
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.CANCELLED,
          actor: PRN_ACTOR.SIGNATORY
        })
      ).rejects.toThrow('No waste balance found for accreditation: acc-456')
    })
  })

  describe('deleting a pending PRN (awaiting authorisation to deleted)', () => {
    it('credits the available balance when the pending PRN is deleted', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 75,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        balance: { amount: 1000, availableAmount: 925 }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.DELETED,
        actor: PRN_ACTOR.SIGNATORY
      })

      const reread = await repositories.prnRepository.findById(PRN_ID)
      expect(reread?.status.currentStatus).toBe(PRN_STATUS.DELETED)

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        { amount: 1000, availableAmount: 1000 }
      )
    })

    it('throws when deleting a pending PRN with no waste balance', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 50,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        })
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.DELETED,
          actor: PRN_ACTOR.SIGNATORY
        })
      ).rejects.toThrow('No waste balance found for accreditation: acc-456')
    })
  })

  describe('routing the balance to the correct pool (December vs general)', () => {
    const LEDGER_ID = {
      organisationId: ORG_ID,
      registrationId: REG_ID,
      accreditationId: ACC_ID
    }

    it('ringfences both the December and total available amounts for an exporter December raise', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          isExport: true,
          isDecemberWaste: true,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        balance: {
          amount: 1000,
          availableAmount: 1000,
          decemberAmount: 300,
          decemberAvailableAmount: 300
        },
        accreditation: { wasteProcessingType: 'exporter' }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER
      })

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        {
          amount: 1000,
          availableAmount: 900,
          decemberAmount: 300,
          decemberAvailableAmount: 200
        }
      )

      const latest =
        await repositories.ledgerRepository.findLatestInLedger(LEDGER_ID)
      expect(latest?.kind).toBe(LEDGER_EVENT_KIND.PRN_CREATED)
      expect(latest?.payload).toMatchObject({
        prnId: PRN_ID,
        amount: 100,
        pool: POOL.DECEMBER
      })

      expect(mockRecordStatusTransition).toHaveBeenCalledWith({
        fromStatus: PRN_STATUS.DRAFT,
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        material: 'plastic',
        isExport: true,
        isDecemberWaste: true,
        obligationYearCarriedForward: false
      })
    })

    it('deducts both the December and total amounts when an exporter December PRN is issued', async () => {
      // The raise event is seeded, not just its resulting balance, because the
      // issue reads the pool it debits off that event (PAE-1977).
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 75,
          isExport: true,
          isDecemberWaste: true,
          lastAppliedEventNumber: 2,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        ledgerEvents: [
          buildOpeningBalanceEvent({
            amount: 1000,
            availableAmount: 1000,
            decemberAmount: 300,
            decemberAvailableAmount: 300
          }),
          buildPrnLedgerEvent({
            kind: LEDGER_EVENT_KIND.PRN_CREATED,
            number: 2,
            pool: POOL.DECEMBER,
            amount: 75,
            openingBalance: {
              amount: 1000,
              availableAmount: 1000,
              decemberAmount: 300,
              decemberAvailableAmount: 300
            },
            closingBalance: {
              amount: 1000,
              availableAmount: 925,
              decemberAmount: 300,
              decemberAvailableAmount: 225
            }
          })
        ],
        accreditation: { wasteProcessingType: 'exporter' }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY
      })

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        {
          amount: 925,
          availableAmount: 925,
          decemberAmount: 225,
          decemberAvailableAmount: 225
        }
      )
    })

    it('refuses an exporter December raise the December pool cannot cover, moving nothing, even when the total can', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          isExport: true,
          isDecemberWaste: true,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        balance: {
          amount: 1000,
          availableAmount: 1000,
          decemberAmount: 50,
          decemberAvailableAmount: 50
        },
        accreditation: { wasteProcessingType: 'exporter' }
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow('Insufficient available waste balance')

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        {
          amount: 1000,
          availableAmount: 1000,
          decemberAmount: 50,
          decemberAvailableAmount: 50
        }
      )
    })

    it('draws the general balance for an output reprocessor that self-declares December', async () => {
      // An output accreditation accrues no December waste (its summary log
      // never populates a December portion), so its balance carries none. A
      // self-declared December raise must resolve to the general pool: were it
      // routed to the (absent) December pool, the raise would be refused for
      // insufficient December balance rather than drawing the ample general one.
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          isDecemberWaste: true,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        balance: { amount: 1000, availableAmount: 1000 },
        accreditation: {
          wasteProcessingType: 'reprocessor',
          reprocessingType: 'output'
        }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER
      })

      const balance = await readBalance(repositories.wasteBalanceService)
      expect(balance).toMatchObject({ amount: 1000, availableAmount: 900 })
      expect(balance?.decemberAvailableAmount).toBeUndefined()

      // The create resolves the pool from the accreditation and writes it, so
      // the event states general explicitly.
      const latest =
        await repositories.ledgerRepository.findLatestInLedger(LEDGER_ID)
      expect(latest?.payload).toMatchObject({ pool: POOL.GENERAL })
    })
  })

  describe('restoring the December pool on reversal', () => {
    // A December raise debits the December pool; its cancellation credits back
    // whichever amounts the raise moved (PAE-1923). The reversal resolves its
    // pool by reading it off the raise event, so it restores the right pool even
    // when the accreditation has since changed. General and output-reprocessor
    // PRNs draw the general balance, so their December amounts never move.
    const LEDGER_ID = {
      organisationId: ORG_ID,
      registrationId: REG_ID,
      accreditationId: ACC_ID
    }

    it('returns the ringfenced December available amount when a not-yet-issued December PRN is cancelled', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          isExport: true,
          isDecemberWaste: true,
          lastAppliedEventNumber: 2,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        ledgerEvents: [
          buildOpeningBalanceEvent({
            amount: 1000,
            availableAmount: 1000,
            decemberAmount: 300,
            decemberAvailableAmount: 300
          }),
          buildPrnLedgerEvent({
            kind: LEDGER_EVENT_KIND.PRN_CREATED,
            number: 2,
            pool: POOL.DECEMBER,
            amount: 100,
            openingBalance: {
              amount: 1000,
              availableAmount: 1000,
              decemberAmount: 300,
              decemberAvailableAmount: 300
            },
            closingBalance: {
              amount: 1000,
              availableAmount: 900,
              decemberAmount: 300,
              decemberAvailableAmount: 200
            }
          })
        ],
        accreditation: { wasteProcessingType: 'exporter' }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.DELETED,
        actor: PRN_ACTOR.SIGNATORY
      })

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        {
          amount: 1000,
          availableAmount: 1000,
          decemberAmount: 300,
          decemberAvailableAmount: 300
        }
      )
    })

    it('returns both December amounts when an issued December PRN is cancelled', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          isExport: true,
          isDecemberWaste: true,
          lastAppliedEventNumber: 3,
          status: {
            currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
            issued: { at: EVENT_AT, by: USER },
            history: []
          }
        }),
        ledgerEvents: [
          buildOpeningBalanceEvent({
            amount: 1000,
            availableAmount: 1000,
            decemberAmount: 300,
            decemberAvailableAmount: 300
          }),
          buildPrnLedgerEvent({
            kind: LEDGER_EVENT_KIND.PRN_CREATED,
            number: 2,
            pool: POOL.DECEMBER,
            amount: 100,
            openingBalance: {
              amount: 1000,
              availableAmount: 1000,
              decemberAmount: 300,
              decemberAvailableAmount: 300
            },
            closingBalance: {
              amount: 1000,
              availableAmount: 900,
              decemberAmount: 300,
              decemberAvailableAmount: 200
            }
          }),
          buildPrnLedgerEvent({
            kind: LEDGER_EVENT_KIND.PRN_ISSUED,
            number: 3,
            pool: POOL.DECEMBER,
            amount: 100,
            openingBalance: {
              amount: 1000,
              availableAmount: 900,
              decemberAmount: 300,
              decemberAvailableAmount: 200
            },
            closingBalance: {
              amount: 900,
              availableAmount: 900,
              decemberAmount: 200,
              decemberAvailableAmount: 200
            }
          })
        ],
        accreditation: { wasteProcessingType: 'exporter' }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.CANCELLED,
        actor: PRN_ACTOR.SIGNATORY
      })

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        {
          amount: 1000,
          availableAmount: 1000,
          decemberAmount: 300,
          decemberAvailableAmount: 300
        }
      )
    })

    it('backs a fresh December raise with the capacity a cancellation restores', async () => {
      // A distinct second PRN sharing the same ledger as the first, so the fresh
      // raise draws on the balance the first PRN's cancellation restored.
      const SECOND_PRN_ID = 'second-december-prn'
      const repositories = seedRepositories({
        prns: [
          buildPrn({
            tonnage: 100,
            isExport: true,
            isDecemberWaste: true,
            lastAppliedEventNumber: 2,
            status: {
              currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
              history: []
            }
          }),
          buildPrn({
            id: SECOND_PRN_ID,
            tonnage: 100,
            isExport: true,
            isDecemberWaste: true,
            status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
          })
        ],
        ledgerEvents: [
          buildOpeningBalanceEvent({
            amount: 1000,
            availableAmount: 1000,
            decemberAmount: 300,
            decemberAvailableAmount: 300
          }),
          buildPrnLedgerEvent({
            kind: LEDGER_EVENT_KIND.PRN_CREATED,
            number: 2,
            pool: POOL.DECEMBER,
            amount: 100,
            openingBalance: {
              amount: 1000,
              availableAmount: 1000,
              decemberAmount: 300,
              decemberAvailableAmount: 300
            },
            closingBalance: {
              amount: 1000,
              availableAmount: 900,
              decemberAmount: 300,
              decemberAvailableAmount: 200
            }
          })
        ],
        accreditation: { wasteProcessingType: 'exporter' }
      })

      // Cancel the first PRN: restores decemberAvailableAmount to 300.
      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.DELETED,
        actor: PRN_ACTOR.SIGNATORY
      })

      // The cancellation returns the full December capacity before it is re-drawn.
      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        {
          amount: 1000,
          availableAmount: 1000,
          decemberAmount: 300,
          decemberAvailableAmount: 300
        }
      )

      // The restored capacity backs a fresh December raise of the same tonnage.
      await callUpdate({
        ...repositories,
        id: SECOND_PRN_ID,
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER
      })

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        {
          amount: 1000,
          availableAmount: 900,
          decemberAmount: 300,
          decemberAvailableAmount: 200
        }
      )
    })

    it('credits the pool the raise recorded, not the one the current accreditation would resolve', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          isDecemberWaste: true,
          lastAppliedEventNumber: 2,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        ledgerEvents: [
          buildOpeningBalanceEvent({
            amount: 1000,
            availableAmount: 1000,
            decemberAmount: 300,
            decemberAvailableAmount: 300
          }),
          buildPrnLedgerEvent({
            kind: LEDGER_EVENT_KIND.PRN_CREATED,
            number: 2,
            pool: POOL.DECEMBER,
            amount: 100,
            openingBalance: {
              amount: 1000,
              availableAmount: 1000,
              decemberAmount: 300,
              decemberAvailableAmount: 300
            },
            closingBalance: {
              amount: 1000,
              availableAmount: 900,
              decemberAmount: 300,
              decemberAvailableAmount: 200
            }
          })
        ],
        // Force the raise event and the accreditation to disagree: the raise
        // drew the December pool, but this accreditation resolves general. The
        // reversal must credit the pool the raise recorded, so it reads the
        // event rather than re-deriving from the accreditation. A guard on that
        // invariant, not a real operator changing processing type.
        accreditation: {
          wasteProcessingType: 'reprocessor',
          reprocessingType: 'output'
        }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.DELETED,
        actor: PRN_ACTOR.SIGNATORY
      })

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        {
          amount: 1000,
          availableAmount: 1000,
          decemberAmount: 300,
          decemberAvailableAmount: 300
        }
      )
    })

    // An output reprocessor accrues no December pool, so a December declaration
    // on one of its PRNs draws the general balance and its raise records
    // `pool: general` (ADR-0049). Cancelling it must leave the December amounts
    // untouched, read off that general raise event rather than re-derived.
    it('leaves the December amounts untouched when an output reprocessor December PRN drawn from the general pool is cancelled', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          isDecemberWaste: true,
          lastAppliedEventNumber: 2,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        ledgerEvents: [
          buildOpeningBalanceEvent({ amount: 1000, availableAmount: 1000 }),
          buildPrnLedgerEvent({
            kind: LEDGER_EVENT_KIND.PRN_CREATED,
            number: 2,
            pool: POOL.GENERAL,
            amount: 100,
            openingBalance: { amount: 1000, availableAmount: 1000 },
            closingBalance: { amount: 1000, availableAmount: 900 }
          })
        ],
        accreditation: {
          wasteProcessingType: 'reprocessor',
          reprocessingType: 'output'
        }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.DELETED,
        actor: PRN_ACTOR.SIGNATORY
      })

      const balance = await readBalance(repositories.wasteBalanceService)
      expect(balance).toMatchObject({ amount: 1000, availableAmount: 1000 })
      expect(balance?.decemberAvailableAmount).toBeUndefined()
    })

    it('allows deleting an output reprocessor PRN that self-declared December, since it drew the general balance', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 75,
          isDecemberWaste: true,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        balance: { amount: 1000, availableAmount: 925 },
        accreditation: {
          wasteProcessingType: 'reprocessor',
          reprocessingType: 'output'
        }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.DELETED,
        actor: PRN_ACTOR.SIGNATORY
      })

      const reread = await repositories.prnRepository.findById(PRN_ID)
      expect(reread?.status.currentStatus).toBe(PRN_STATUS.DELETED)
      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        {
          amount: 1000,
          availableAmount: 1000
        }
      )
      const latest =
        await repositories.ledgerRepository.findLatestInLedger(LEDGER_ID)
      expect(latest?.kind).toBe(LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED)
    })
  })

  describe('resolving the pool on issue (PAE-1977)', () => {
    // The issue must debit the pool the raise recorded, read off the raise
    // event exactly as a reversal reads it (ADR-0049). Were it re-derived from
    // the accreditation, a processing-type change between raise and issue would
    // debit a different pool from the one the raise drew, and the cancellation
    // (which reads the raise event) would credit December tonnage that was
    // never debited. As with the reversal tests, the disagreeing accreditation
    // guards the invariant rather than modelling a real operator flow.
    const LEDGER_ID = {
      organisationId: ORG_ID,
      registrationId: REG_ID,
      accreditationId: ACC_ID
    }

    it('debits the pool the raise recorded, not the one the current accreditation would resolve', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          isDecemberWaste: true,
          lastAppliedEventNumber: 2,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        ledgerEvents: [
          buildOpeningBalanceEvent({
            amount: 1000,
            availableAmount: 1000,
            decemberAmount: 300,
            decemberAvailableAmount: 300
          }),
          buildPrnLedgerEvent({
            kind: LEDGER_EVENT_KIND.PRN_CREATED,
            number: 2,
            pool: POOL.DECEMBER,
            amount: 100,
            openingBalance: {
              amount: 1000,
              availableAmount: 1000,
              decemberAmount: 300,
              decemberAvailableAmount: 300
            },
            closingBalance: {
              amount: 1000,
              availableAmount: 900,
              decemberAmount: 300,
              decemberAvailableAmount: 200
            }
          })
        ],
        // The raise drew the December pool; this accreditation resolves general.
        accreditation: {
          wasteProcessingType: 'reprocessor',
          reprocessingType: 'output'
        }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY
      })

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        {
          amount: 900,
          availableAmount: 900,
          decemberAmount: 200,
          decemberAvailableAmount: 200
        }
      )

      const latest =
        await repositories.ledgerRepository.findLatestInLedger(LEDGER_ID)
      expect(latest?.kind).toBe(LEDGER_EVENT_KIND.PRN_ISSUED)
      expect(latest?.payload).toMatchObject({ pool: POOL.DECEMBER })
    })

    it('restores the December split exactly when a PRN issued after the accreditation stopped accruing December is cancelled', async () => {
      // The ticket's sequence end to end: raise drew December, the
      // accreditation changed, then issue and cancel. The December balance must
      // round-trip to exactly what it opened at — a December amount above 300
      // would be tonnage credited that was never debited.
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          isDecemberWaste: true,
          lastAppliedEventNumber: 2,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        ledgerEvents: [
          buildOpeningBalanceEvent({
            amount: 1000,
            availableAmount: 1000,
            decemberAmount: 300,
            decemberAvailableAmount: 300
          }),
          buildPrnLedgerEvent({
            kind: LEDGER_EVENT_KIND.PRN_CREATED,
            number: 2,
            pool: POOL.DECEMBER,
            amount: 100,
            openingBalance: {
              amount: 1000,
              availableAmount: 1000,
              decemberAmount: 300,
              decemberAvailableAmount: 300
            },
            closingBalance: {
              amount: 1000,
              availableAmount: 900,
              decemberAmount: 300,
              decemberAvailableAmount: 200
            }
          })
        ],
        accreditation: {
          wasteProcessingType: 'reprocessor',
          reprocessingType: 'output'
        }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.CANCELLED,
        actor: PRN_ACTOR.SERVICE_MAINTAINER
      })

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        {
          amount: 1000,
          availableAmount: 1000,
          decemberAmount: 300,
          decemberAvailableAmount: 300
        }
      )
    })

    it('leaves the December amounts untouched when the raise drew the general pool but the accreditation now accrues December', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          isDecemberWaste: true,
          lastAppliedEventNumber: 2,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        ledgerEvents: [
          buildOpeningBalanceEvent({
            amount: 1000,
            availableAmount: 1000,
            decemberAmount: 300,
            decemberAvailableAmount: 300
          }),
          buildPrnLedgerEvent({
            kind: LEDGER_EVENT_KIND.PRN_CREATED,
            number: 2,
            pool: POOL.GENERAL,
            amount: 100,
            openingBalance: {
              amount: 1000,
              availableAmount: 1000,
              decemberAmount: 300,
              decemberAvailableAmount: 300
            },
            closingBalance: {
              amount: 1000,
              availableAmount: 900,
              decemberAmount: 300,
              decemberAvailableAmount: 300
            }
          })
        ],
        // The raise drew the general pool; this accreditation resolves December.
        accreditation: { wasteProcessingType: 'exporter' }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY
      })

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        {
          amount: 900,
          availableAmount: 900,
          decemberAmount: 300,
          decemberAvailableAmount: 300
        }
      )

      const latest =
        await repositories.ledgerRepository.findLatestInLedger(LEDGER_ID)
      expect(latest?.kind).toBe(LEDGER_EVENT_KIND.PRN_ISSUED)
      expect(latest?.payload).toMatchObject({ pool: POOL.GENERAL })
    })

    it('issues a general-pool raise even when the balance carries no December portion the current accreditation would require', async () => {
      // Re-deriving December here would test sufficiency against an absent
      // December amount (coalesced to 0) and wrongly refuse the issue.
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          isDecemberWaste: true,
          lastAppliedEventNumber: 2,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        ledgerEvents: [
          buildOpeningBalanceEvent({ amount: 1000, availableAmount: 1000 }),
          buildPrnLedgerEvent({
            kind: LEDGER_EVENT_KIND.PRN_CREATED,
            number: 2,
            pool: POOL.GENERAL,
            amount: 100,
            openingBalance: { amount: 1000, availableAmount: 1000 },
            closingBalance: { amount: 1000, availableAmount: 900 }
          })
        ],
        accreditation: { wasteProcessingType: 'exporter' }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY
      })

      const balance = await readBalance(repositories.wasteBalanceService)
      expect(balance).toMatchObject({ amount: 900, availableAmount: 900 })
      expect(balance?.decemberAmount).toBeUndefined()
    })

    it('debits the general pool when the raise predates the pool dimension', async () => {
      // A raise recorded before ADR-0049 carries no pool on its event. The
      // issue coalesces that to general, exactly as the reversals and the
      // closing-balance reader do, so a pre-pool PRN stays general throughout
      // its life — even when the current accreditation would resolve December.
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          isDecemberWaste: true,
          lastAppliedEventNumber: 2,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        ledgerEvents: [
          buildOpeningBalanceEvent({
            amount: 1000,
            availableAmount: 1000,
            decemberAmount: 300,
            decemberAvailableAmount: 300
          }),
          buildPrnLedgerEvent({
            kind: LEDGER_EVENT_KIND.PRN_CREATED,
            number: 2,
            amount: 100,
            openingBalance: {
              amount: 1000,
              availableAmount: 1000,
              decemberAmount: 300,
              decemberAvailableAmount: 300
            },
            closingBalance: {
              amount: 1000,
              availableAmount: 900,
              decemberAmount: 300,
              decemberAvailableAmount: 300
            }
          })
        ],
        accreditation: { wasteProcessingType: 'exporter' }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY
      })

      expect(await readBalance(repositories.wasteBalanceService)).toMatchObject(
        {
          amount: 900,
          availableAmount: 900,
          decemberAmount: 300,
          decemberAvailableAmount: 300
        }
      )

      const latest =
        await repositories.ledgerRepository.findLatestInLedger(LEDGER_ID)
      expect(latest?.kind).toBe(LEDGER_EVENT_KIND.PRN_ISSUED)
      expect(latest?.payload).not.toHaveProperty('pool')
    })

    it('gates only on targets whose every inbound transition moves the balance', () => {
      // The pool gate keys on target status alone. That is sound only while
      // every state-machine transition into one of its targets carries a
      // balance effect; a future no-balance transition into one would need the
      // gate keyed on the (from, to) pair instead, and this test is what makes
      // that change loud rather than a silent misroute.
      for (const status of FOLLOW_RAISE_POOL_STATUSES) {
        const inboundFrom = Object.entries(PRN_STATUS_TRANSITIONS)
          .filter(([, transitions]) =>
            transitions.some((transition) => transition.status === status)
          )
          .map(([from]) => from)

        expect(inboundFrom.length).toBeGreaterThan(0)
        for (const from of inboundFrom) {
          expect(
            PRN_TRANSITION_EFFECTS.some(
              (effect) => effect.from === from && effect.to === status
            )
          ).toBe(true)
        }
      }
    })
  })

  describe('stamping an explicit pool on every general PRN event (PAE-1977)', () => {
    // A general (non-December) PRN's ledger events used to disagree on the pool
    // key: absent on the raise, an accidental explicit general on the issue (the
    // accreditation was in hand for the number stamp), absent on the reversals.
    // The raise now resolves general as a constant (no accreditation read) and
    // writes it, and every later movement reads it back, so the whole life of a
    // general PRN carries `pool: general` uniformly. A historical raise that
    // predates the pool dimension stays bare and coalesces to general, so no
    // migration is needed.
    const LEDGER_ID = {
      organisationId: ORG_ID,
      registrationId: REG_ID,
      accreditationId: ACC_ID
    }

    it('writes an explicit general pool on a non-December raise without reading the accreditation', async () => {
      // No accreditation is seeded, so a general pool on the event can only have
      // been resolved as the constant it is, never fetched.
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        balance: { amount: 1000, availableAmount: 1000 },
        withAccreditation: false
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER
      })

      const latest =
        await repositories.ledgerRepository.findLatestInLedger(LEDGER_ID)
      expect(latest?.kind).toBe(LEDGER_EVENT_KIND.PRN_CREATED)
      expect(latest?.payload).toMatchObject({ pool: POOL.GENERAL })
    })

    it('mirrors an absent raise pool on a non-December issue rather than re-deriving it', async () => {
      // A general PRN whose raise predates the pool dimension carries no pool.
      // The issue reads that absent pool off the raise and stays bare, rather
      // than re-deriving general from the accreditation it loads for the number
      // stamp, so the issue mirrors its raise exactly.
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          lastAppliedEventNumber: 2,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        ledgerEvents: [
          buildOpeningBalanceEvent({ amount: 1000, availableAmount: 1000 }),
          buildPrnLedgerEvent({
            kind: LEDGER_EVENT_KIND.PRN_CREATED,
            number: 2,
            amount: 100,
            openingBalance: { amount: 1000, availableAmount: 1000 },
            closingBalance: { amount: 1000, availableAmount: 900 }
          })
        ]
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY
      })

      const latest =
        await repositories.ledgerRepository.findLatestInLedger(LEDGER_ID)
      expect(latest?.kind).toBe(LEDGER_EVENT_KIND.PRN_ISSUED)
      expect(latest?.payload).not.toHaveProperty('pool')
    })

    it('reads the general pool back onto a non-December reversal event', async () => {
      // The delete reads the pool off the raise for every PRN, so a general
      // raise's reversal states general explicitly rather than omitting it. No
      // accreditation is seeded, so the pool can only have come from the raise.
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          lastAppliedEventNumber: 2,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        ledgerEvents: [
          buildOpeningBalanceEvent({ amount: 1000, availableAmount: 1000 }),
          buildPrnLedgerEvent({
            kind: LEDGER_EVENT_KIND.PRN_CREATED,
            number: 2,
            pool: POOL.GENERAL,
            amount: 100,
            openingBalance: { amount: 1000, availableAmount: 1000 },
            closingBalance: { amount: 1000, availableAmount: 900 }
          })
        ],
        withAccreditation: false
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.DELETED,
        actor: PRN_ACTOR.SIGNATORY
      })

      const latest =
        await repositories.ledgerRepository.findLatestInLedger(LEDGER_ID)
      expect(latest?.kind).toBe(LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED)
      expect(latest?.payload).toMatchObject({ pool: POOL.GENERAL })
    })
  })

  describe('metrics', () => {
    it('records the status transition metric on a successful update', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        balance: { amount: 1000, availableAmount: 1000 }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER
      })

      expect(mockRecordStatusTransition).toHaveBeenCalledWith({
        fromStatus: PRN_STATUS.DRAFT,
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        material: 'plastic',
        isExport: false,
        isDecemberWaste: false,
        obligationYearCarriedForward: false
      })
    })
  })
})
