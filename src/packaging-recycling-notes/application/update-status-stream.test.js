import { describe, it, expect, vi, afterEach } from 'vitest'

import {
  PRN_STATUS,
  PRN_ACTOR,
  SuspendedAccreditationError
} from '#packaging-recycling-notes/domain/model.js'
import { REGULATOR } from '#domain/organisations/model.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '#waste-balances/domain/model.js'

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
  status: { currentStatus: PRN_STATUS.DRAFT },
  ...overrides
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
    user: { id: 'user-789', name: 'Test User' },
    ...overrides
  })

afterEach(() => {
  vi.clearAllMocks()
})

describe('updatePrnStatus on the ledger (event-first) path', () => {
  it('stamps the appended watermark onto the PRN document when creating', async () => {
    const updateStatus = vi.fn().mockResolvedValue(buildPrn())
    const prnRepository = { findById: vi.fn(), updateStatus }
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(buildLedgerBalance()),
      deductAvailableBalanceForPrnCreation: vi
        .fn()
        .mockResolvedValue(APPENDED_WATERMARK)
    }

    await callUpdate({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository: buildOrganisationsRepository(),
      providedPrn: buildPrn({ status: { currentStatus: PRN_STATUS.DRAFT } }),
      newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      actor: PRN_ACTOR.REPROCESSOR_EXPORTER
    })

    expect(updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ lastAppliedEventNumber: APPENDED_WATERMARK })
    )
  })

  it('appends the balance event before writing the PRN document when issuing', async () => {
    const updateStatus = vi.fn().mockResolvedValue(buildPrn())
    const prnRepository = { findById: vi.fn(), updateStatus }
    const deductTotalBalanceForPrnIssue = vi
      .fn()
      .mockResolvedValue(APPENDED_WATERMARK)
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(buildLedgerBalance()),
      deductTotalBalanceForPrnIssue
    }

    await callUpdate({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository: buildOrganisationsRepository(),
      providedPrn: buildPrn({
        status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
      }),
      newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      actor: PRN_ACTOR.SIGNATORY
    })

    expect(
      deductTotalBalanceForPrnIssue.mock.invocationCallOrder[0]
    ).toBeLessThan(updateStatus.mock.invocationCallOrder[0])
    expect(updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ lastAppliedEventNumber: APPENDED_WATERMARK })
    )
  })

  it('rejects issuance on a suspended accreditation before appending any event', async () => {
    const updateStatus = vi.fn().mockResolvedValue(buildPrn())
    const prnRepository = { findById: vi.fn(), updateStatus }
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
          status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
        }),
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY
      })
    ).rejects.toThrow(SuspendedAccreditationError)

    expect(deductTotalBalanceForPrnIssue).not.toHaveBeenCalled()
    expect(updateStatus).not.toHaveBeenCalled()
  })

  it('appends the credit event before writing the PRN document when cancelling an issued PRN', async () => {
    const updateStatus = vi.fn().mockResolvedValue(buildPrn())
    const prnRepository = { findById: vi.fn(), updateStatus }
    const creditFullBalanceForIssuedPrnCancellation = vi
      .fn()
      .mockResolvedValue(APPENDED_WATERMARK)
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(buildLedgerBalance()),
      creditFullBalanceForIssuedPrnCancellation
    }

    await callUpdate({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository: buildOrganisationsRepository(),
      providedPrn: buildPrn({
        status: { currentStatus: PRN_STATUS.AWAITING_CANCELLATION },
        lastAppliedEventNumber: 2
      }),
      newStatus: PRN_STATUS.CANCELLED,
      actor: PRN_ACTOR.SIGNATORY
    })

    expect(
      creditFullBalanceForIssuedPrnCancellation.mock.invocationCallOrder[0]
    ).toBeLessThan(updateStatus.mock.invocationCallOrder[0])
    expect(updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ lastAppliedEventNumber: APPENDED_WATERMARK })
    )
  })

  it('carries the existing watermark forward on a lifecycle-only transition', async () => {
    const updateStatus = vi.fn().mockResolvedValue(buildPrn())
    const prnRepository = { findById: vi.fn(), updateStatus }

    await callUpdate({
      prnRepository,
      wasteBalancesRepository: {},
      organisationsRepository: buildOrganisationsRepository(),
      providedPrn: buildPrn({
        status: { currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE },
        lastAppliedEventNumber: 7
      }),
      newStatus: PRN_STATUS.ACCEPTED,
      actor: PRN_ACTOR.PRODUCER
    })

    expect(updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ lastAppliedEventNumber: 7 })
    )
  })

  it('does not credit the balance back when the PRN document write fails on creation', async () => {
    const updateStatus = vi
      .fn()
      .mockRejectedValue(new Error('doc write failed'))
    const prnRepository = { findById: vi.fn(), updateStatus }
    const creditAvailableBalanceForPrnCancellation = vi.fn()
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(buildLedgerBalance()),
      deductAvailableBalanceForPrnCreation: vi
        .fn()
        .mockResolvedValue(APPENDED_WATERMARK),
      creditAvailableBalanceForPrnCancellation
    }

    await expect(
      callUpdate({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: buildOrganisationsRepository(),
        providedPrn: buildPrn({ status: { currentStatus: PRN_STATUS.DRAFT } }),
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER
      })
    ).rejects.toThrow('doc write failed')

    expect(creditAvailableBalanceForPrnCancellation).not.toHaveBeenCalled()
  })
})
