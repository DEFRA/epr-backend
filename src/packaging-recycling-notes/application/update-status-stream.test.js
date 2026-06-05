import { describe, it, expect, vi, afterEach } from 'vitest'

import {
  PRN_STATUS,
  PRN_ACTOR,
  SuspendedAccreditationError
} from '#packaging-recycling-notes/domain/model.js'
import { REGULATOR } from '#domain/organisations/model.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '#waste-balances/domain/model.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryWasteBalancesRepository } from '#waste-balances/repository/inmemory.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'

vi.mock('./metrics.js', () => ({
  prnMetrics: {
    recordStatusTransition: vi.fn().mockResolvedValue(undefined)
  }
}))

const { updatePrnStatus } = await import('./update-status.js')
const { getProjectedPrnByNumber } = await import('./get-projected-prn.js')

const ORG_ID = 'org-123'
const ACC_ID = 'acc-456'
const REG_ID = 'reg-789'
const PRN_ID = '507f1f77bcf86cd799439011'
const PRN_NUMBER = 'ER2600001'
const TONNAGE = 50
const APPENDED_WATERMARK = 5
const USER = { id: 'user-789', name: 'Test User' }
const EVENT_AT = new Date('2026-02-01T12:00:00.000Z')

const buildLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn()
})

const buildLedgerBalance = (overrides = {}) => ({
  accreditationId: ACC_ID,
  amount: 1000,
  availableAmount: 1000,
  canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
  ...overrides
})

/**
 * @returns {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote}
 */
const buildPrn = (overrides = {}) => ({
  id: PRN_ID,
  schemaVersion: 2,
  version: 3,
  registrationId: REG_ID,
  organisation: { id: ORG_ID, name: 'Test Reprocessor' },
  accreditation: {
    id: ACC_ID,
    accreditationNumber: 'ACC-1',
    accreditationYear: 2026,
    material: 'plastic',
    submittedToRegulator: REGULATOR.EA
  },
  issuedToOrganisation: { id: 'producer-1', name: 'Producer Org' },
  tonnage: TONNAGE,
  isExport: false,
  isDecemberWaste: false,
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

const buildStreamEvent = (kind, number = APPENDED_WATERMARK) => ({
  id: `event-${number}`,
  registrationId: REG_ID,
  accreditationId: ACC_ID,
  organisationId: ORG_ID,
  number,
  kind,
  payload: { prnId: PRN_ID, amount: TONNAGE },
  openingBalance: { amount: 1000, availableAmount: 1000 },
  closingBalance: { amount: 1000, availableAmount: 950 },
  createdAt: EVENT_AT,
  createdBy: USER
})

const buildOrganisationsRepository = (accreditation = {}) => ({
  findAccreditationById: vi.fn().mockResolvedValue({
    submittedToRegulator: REGULATOR.EA,
    ...accreditation
  })
})

const buildLedgerRepositories = (storedPrn, events = []) => {
  const packagingRecyclingNotesRepository =
    createInMemoryPackagingRecyclingNotesRepository([storedPrn])(buildLogger())
  const streamRepository = createInMemoryStreamRepository(events)()
  const wasteBalancesRepository = createInMemoryWasteBalancesRepository(
    [
      {
        id: 'wb-1',
        accreditationId: ACC_ID,
        organisationId: ORG_ID,
        amount: 1000,
        availableAmount: 1000,
        transactions: [],
        version: 0,
        schemaVersion: 1,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
      }
    ],
    { streamRepository }
  )()
  return { packagingRecyclingNotesRepository, wasteBalancesRepository }
}

const callUpdate = (overrides) =>
  updatePrnStatus({
    logger: buildLogger(),
    id: PRN_ID,
    organisationId: ORG_ID,
    registrationId: REG_ID,
    accreditationId: ACC_ID,
    user: USER,
    ...overrides
  })

afterEach(() => {
  vi.clearAllMocks()
})

describe('updatePrnStatus on the ledger (event-first) path', () => {
  it('persists a projection carrying the appended watermark when creating', async () => {
    const storedPrn = buildPrn({
      version: 1,
      status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
    })
    const packagingRecyclingNotesRepository =
      createInMemoryPackagingRecyclingNotesRepository([storedPrn])(
        buildLogger()
      )
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(buildLedgerBalance()),
      deductAvailableBalanceForPrnCreation: vi
        .fn()
        .mockResolvedValue(buildStreamEvent(STREAM_EVENT_KIND.PRN_CREATED))
    }

    await callUpdate({
      prnRepository: packagingRecyclingNotesRepository,
      wasteBalancesRepository,
      organisationsRepository: buildOrganisationsRepository(),
      providedPrn: storedPrn,
      newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      actor: PRN_ACTOR.REPROCESSOR_EXPORTER
    })

    const reread = await packagingRecyclingNotesRepository.findById(PRN_ID)
    expect(reread?.status.currentStatus).toBe(PRN_STATUS.AWAITING_AUTHORISATION)
    expect(reread?.lastAppliedEventNumber).toBe(APPENDED_WATERMARK)
    expect(reread?.version).toBe(2)
  })

  it('appends the balance event before persisting the projection when issuing', async () => {
    const persistProjection = vi
      .fn()
      .mockImplementation(async ({ projection }) => projection)
    const prnRepository = { findById: vi.fn(), persistProjection }
    const deductTotalBalanceForPrnIssue = vi
      .fn()
      .mockResolvedValue(buildStreamEvent(STREAM_EVENT_KIND.PRN_ISSUED))
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(buildLedgerBalance()),
      deductTotalBalanceForPrnIssue
    }

    await callUpdate({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository: buildOrganisationsRepository(),
      providedPrn: buildPrn({
        status: {
          currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          history: []
        }
      }),
      newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      actor: PRN_ACTOR.SIGNATORY
    })

    expect(
      deductTotalBalanceForPrnIssue.mock.invocationCallOrder[0]
    ).toBeLessThan(persistProjection.mock.invocationCallOrder[0])
    expect(persistProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        projection: expect.objectContaining({
          lastAppliedEventNumber: APPENDED_WATERMARK
        })
      })
    )
  })

  it('rejects issuance on a suspended accreditation before appending any event', async () => {
    const persistProjection = vi.fn()
    const prnRepository = { findById: vi.fn(), persistProjection }
    const deductTotalBalanceForPrnIssue = vi.fn()
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(buildLedgerBalance()),
      deductTotalBalanceForPrnIssue
    }

    await expect(
      callUpdate({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: buildOrganisationsRepository({
          status: 'suspended'
        }),
        providedPrn: buildPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY
      })
    ).rejects.toThrow(SuspendedAccreditationError)

    expect(deductTotalBalanceForPrnIssue).not.toHaveBeenCalled()
    expect(persistProjection).not.toHaveBeenCalled()
  })

  it('appends the credit event before persisting the projection when cancelling an issued PRN', async () => {
    const persistProjection = vi
      .fn()
      .mockImplementation(async ({ projection }) => projection)
    const prnRepository = { findById: vi.fn(), persistProjection }
    const creditFullBalanceForIssuedPrnCancellation = vi
      .fn()
      .mockResolvedValue(
        buildStreamEvent(STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE)
      )
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(buildLedgerBalance()),
      creditFullBalanceForIssuedPrnCancellation
    }

    await callUpdate({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository: buildOrganisationsRepository(),
      providedPrn: buildPrn({
        status: {
          currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
          history: []
        },
        lastAppliedEventNumber: 2
      }),
      newStatus: PRN_STATUS.CANCELLED,
      actor: PRN_ACTOR.SIGNATORY
    })

    expect(
      creditFullBalanceForIssuedPrnCancellation.mock.invocationCallOrder[0]
    ).toBeLessThan(persistProjection.mock.invocationCallOrder[0])
    expect(persistProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        projection: expect.objectContaining({
          lastAppliedEventNumber: APPENDED_WATERMARK
        })
      })
    )
  })

  it('carries the existing watermark forward on a lifecycle-only transition (embedded path)', async () => {
    const updateStatus = vi.fn().mockResolvedValue(buildPrn())
    const prnRepository = { findById: vi.fn(), updateStatus }

    await callUpdate({
      prnRepository,
      wasteBalancesRepository: {
        findByAccreditationId: vi.fn().mockResolvedValue(null)
      },
      organisationsRepository: buildOrganisationsRepository(),
      providedPrn: buildPrn({
        status: {
          currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          history: []
        },
        lastAppliedEventNumber: 7
      }),
      newStatus: PRN_STATUS.ACCEPTED,
      actor: PRN_ACTOR.PRODUCER
    })

    expect(updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ lastAppliedEventNumber: 7 })
    )
  })

  it('does not credit the balance back when persistProjection fails on creation', async () => {
    const persistProjection = vi
      .fn()
      .mockRejectedValue(new Error('doc write failed'))
    const prnRepository = { findById: vi.fn(), persistProjection }
    const creditAvailableBalanceForPrnCancellation = vi.fn()
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(buildLedgerBalance()),
      deductAvailableBalanceForPrnCreation: vi
        .fn()
        .mockResolvedValue(buildStreamEvent(STREAM_EVENT_KIND.PRN_CREATED)),
      creditAvailableBalanceForPrnCancellation
    }

    await expect(
      callUpdate({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: buildOrganisationsRepository(),
        providedPrn: buildPrn({
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER
      })
    ).rejects.toThrow('doc write failed')

    expect(creditAvailableBalanceForPrnCancellation).not.toHaveBeenCalled()
  })

  it('retries issuance on a PrnNumberConflictError and persists on the second attempt', async () => {
    const persistProjection = vi
      .fn()
      .mockImplementationOnce(async () => {
        const { PrnNumberConflictError } =
          await import('#packaging-recycling-notes/repository/port.js')
        throw new PrnNumberConflictError('ER2600001')
      })
      .mockImplementation(async ({ projection }) => projection)
    const prnRepository = { findById: vi.fn(), persistProjection }
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(buildLedgerBalance()),
      deductTotalBalanceForPrnIssue: vi
        .fn()
        .mockResolvedValue(buildStreamEvent(STREAM_EVENT_KIND.PRN_ISSUED))
    }

    await callUpdate({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository: buildOrganisationsRepository(),
      providedPrn: buildPrn({
        status: {
          currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          history: []
        }
      }),
      newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      actor: PRN_ACTOR.SIGNATORY
    })

    expect(persistProjection).toHaveBeenCalledTimes(2)
  })

  it('throws after exhausting every PRN number suffix retry on issuance', async () => {
    const { PrnNumberConflictError } =
      await import('#packaging-recycling-notes/repository/port.js')
    const persistProjection = vi
      .fn()
      .mockRejectedValue(new PrnNumberConflictError('ER2600001'))
    const prnRepository = { findById: vi.fn(), persistProjection }
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(buildLedgerBalance()),
      deductTotalBalanceForPrnIssue: vi
        .fn()
        .mockResolvedValue(buildStreamEvent(STREAM_EVENT_KIND.PRN_ISSUED))
    }

    await expect(
      callUpdate({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: buildOrganisationsRepository(),
        providedPrn: buildPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY
      })
    ).rejects.toThrow(/Unable to generate unique PRN number/)
  })

  it('throws Boom.badImplementation when persistProjection returns null on issuance', async () => {
    const persistProjection = vi.fn().mockResolvedValue(null)
    const prnRepository = { findById: vi.fn(), persistProjection }
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(buildLedgerBalance()),
      deductTotalBalanceForPrnIssue: vi
        .fn()
        .mockResolvedValue(buildStreamEvent(STREAM_EVENT_KIND.PRN_ISSUED))
    }

    await expect(
      callUpdate({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: buildOrganisationsRepository(),
        providedPrn: buildPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY
      })
    ).rejects.toThrow(/Failed to persist PRN projection/)
  })

  it('throws Boom.badImplementation when persistProjection returns null on a non-issuance ledger write', async () => {
    const persistProjection = vi.fn().mockResolvedValue(null)
    const prnRepository = { findById: vi.fn(), persistProjection }
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(buildLedgerBalance()),
      creditFullBalanceForIssuedPrnCancellation: vi
        .fn()
        .mockResolvedValue(
          buildStreamEvent(STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE)
        )
    }

    await expect(
      callUpdate({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: buildOrganisationsRepository(),
        providedPrn: buildPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
            history: []
          }
        }),
        newStatus: PRN_STATUS.CANCELLED,
        actor: PRN_ACTOR.SIGNATORY
      })
    ).rejects.toThrow(/Failed to persist PRN projection/)
  })

  it('does not roll back the balance when persistProjection fails on issuance', async () => {
    const persistProjection = vi
      .fn()
      .mockRejectedValue(new Error('doc write failed'))
    const prnRepository = { findById: vi.fn(), persistProjection }
    const creditFullBalanceForIssuedPrnCancellation = vi.fn()
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(buildLedgerBalance()),
      deductTotalBalanceForPrnIssue: vi
        .fn()
        .mockResolvedValue(buildStreamEvent(STREAM_EVENT_KIND.PRN_ISSUED)),
      creditFullBalanceForIssuedPrnCancellation
    }

    await expect(
      callUpdate({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: buildOrganisationsRepository(),
        providedPrn: buildPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY
      })
    ).rejects.toThrow('doc write failed')

    expect(creditFullBalanceForIssuedPrnCancellation).not.toHaveBeenCalled()
  })
})

describe('updatePrnStatus composes the read fold with the real CAS-enforcing repository', () => {
  it('accepts a PRN whose stored document trails the stream without a version conflict', async () => {
    const storedPrn = buildPrn({
      prnNumber: PRN_NUMBER,
      registrationId: REG_ID,
      version: 1,
      lastAppliedEventNumber: 1,
      status: {
        currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        currentStatusAt: EVENT_AT,
        history: []
      }
    })
    const { packagingRecyclingNotesRepository, wasteBalancesRepository } =
      buildLedgerRepositories(storedPrn, [
        buildStreamEvent(STREAM_EVENT_KIND.PRN_CREATED, 1),
        buildStreamEvent(STREAM_EVENT_KIND.PRN_ISSUED, 2)
      ])

    const projected = await getProjectedPrnByNumber({
      packagingRecyclingNotesRepository,
      wasteBalancesRepository,
      prnNumber: PRN_NUMBER
    })
    expect(projected?.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)

    const accepted = await callUpdate({
      prnRepository: packagingRecyclingNotesRepository,
      wasteBalancesRepository,
      organisationsRepository: buildOrganisationsRepository(),
      providedPrn: projected,
      newStatus: PRN_STATUS.ACCEPTED,
      actor: PRN_ACTOR.PRODUCER
    })

    expect(accepted.status.currentStatus).toBe(PRN_STATUS.ACCEPTED)

    const reread = await packagingRecyclingNotesRepository.findById(PRN_ID)
    expect(reread?.status.currentStatus).toBe(PRN_STATUS.ACCEPTED)
    expect(reread?.version).toBe(2)
  })
})
