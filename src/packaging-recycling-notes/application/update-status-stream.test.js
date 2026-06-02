import { describe, it, expect, vi, afterEach } from 'vitest'

import {
  PRN_STATUS,
  PRN_ACTOR,
  SuspendedAccreditationError
} from '#packaging-recycling-notes/domain/model.js'
import { REGULATOR } from '#domain/organisations/model.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '#waste-balances/domain/model.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'

vi.mock('./metrics.js', () => ({
  prnMetrics: {
    recordStatusTransition: vi.fn().mockResolvedValue(undefined)
  }
}))

const { updatePrnStatus } = await import('./update-status.js')

const ORG_ID = 'org-123'
const ACC_ID = 'acc-456'
const REG_ID = 'reg-789'
const PRN_ID = '507f1f77bcf86cd799439011'
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
  fatal: vi.fn()
})

const buildLedgerBalance = (overrides = {}) => ({
  accreditationId: ACC_ID,
  amount: 1000,
  availableAmount: 1000,
  canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
  ...overrides
})

const buildPrn = (overrides = {}) => ({
  id: PRN_ID,
  organisation: { id: ORG_ID },
  accreditation: { id: ACC_ID, accreditationYear: 2026, material: 'plastic' },
  isExport: false,
  tonnage: TONNAGE,
  version: 3,
  status: {
    currentStatus: PRN_STATUS.DRAFT,
    history: []
  },
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
    const persistProjection = vi
      .fn()
      .mockImplementation(async ({ projection }) => projection)
    const prnRepository = { findById: vi.fn(), persistProjection }
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(buildLedgerBalance()),
      deductAvailableBalanceForPrnCreation: vi
        .fn()
        .mockResolvedValue(buildStreamEvent(STREAM_EVENT_KIND.PRN_CREATED))
    }

    await callUpdate({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository: buildOrganisationsRepository(),
      providedPrn: buildPrn({
        status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
      }),
      newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      actor: PRN_ACTOR.REPROCESSOR_EXPORTER
    })

    expect(persistProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        projection: expect.objectContaining({
          lastAppliedEventNumber: APPENDED_WATERMARK
        })
      })
    )
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
