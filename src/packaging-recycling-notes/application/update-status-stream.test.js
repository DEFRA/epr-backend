import { describe, it, expect, vi, afterEach } from 'vitest'

import {
  PRN_STATUS,
  PRN_ACTOR,
  SuspendedAccreditationError
} from '#packaging-recycling-notes/domain/model.js'
import { REGULATOR } from '#domain/organisations/model.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'

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
const SEED_NUMBER = 1
const APPENDED_WATERMARK = 2
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

const buildLedgerEvent = (kind, number = APPENDED_WATERMARK) => ({
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

/**
 * Seed the ledger with a summary-log submission so the read fold resolves a
 * non-zero balance with room to spare. The first PRN command then appends at
 * APPENDED_WATERMARK.
 */
const buildSeededLedgerRepository = () =>
  createInMemoryLedgerRepository([
    {
      id: 'seed-1',
      registrationId: REG_ID,
      accreditationId: ACC_ID,
      organisationId: ORG_ID,
      number: SEED_NUMBER,
      kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
      payload: { summaryLogId: 'seed', creditTotal: 1000 },
      openingBalance: { amount: 0, availableAmount: 0 },
      closingBalance: { amount: 1000, availableAmount: 1000 },
      createdAt: EVENT_AT,
      createdBy: USER
    }
  ])()

const buildOrganisationsRepository = (accreditation = {}) => ({
  findAccreditationById: vi.fn().mockResolvedValue({
    submittedToRegulator: REGULATOR.EA,
    ...accreditation
  })
})

const buildLedgerRepositories = (storedPrn, events = []) => {
  const packagingRecyclingNotesRepository =
    createInMemoryPackagingRecyclingNotesRepository([storedPrn])(buildLogger())
  const ledgerRepository = createInMemoryLedgerRepository(events)()
  return {
    packagingRecyclingNotesRepository,
    ledgerRepository
  }
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
    const ledgerRepository = buildSeededLedgerRepository()

    await callUpdate({
      prnRepository: packagingRecyclingNotesRepository,
      ledgerRepository,
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
    const ledgerRepository = buildSeededLedgerRepository()
    const appendEvents = vi.spyOn(ledgerRepository, 'appendEvents')

    await callUpdate({
      prnRepository,
      ledgerRepository,
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

    expect(appendEvents.mock.invocationCallOrder[0]).toBeLessThan(
      persistProjection.mock.invocationCallOrder[0]
    )
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
    const ledgerRepository = buildSeededLedgerRepository()
    const appendEvents = vi.spyOn(ledgerRepository, 'appendEvents')

    await expect(
      callUpdate({
        prnRepository,
        ledgerRepository,
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

    expect(appendEvents).not.toHaveBeenCalled()
    expect(persistProjection).not.toHaveBeenCalled()
  })

  it('appends the credit event before persisting the projection when cancelling an issued PRN', async () => {
    const persistProjection = vi
      .fn()
      .mockImplementation(async ({ projection }) => projection)
    const prnRepository = { findById: vi.fn(), persistProjection }
    const ledgerRepository = buildSeededLedgerRepository()
    const appendEvents = vi.spyOn(ledgerRepository, 'appendEvents')

    await callUpdate({
      prnRepository,
      ledgerRepository,
      organisationsRepository: buildOrganisationsRepository(),
      providedPrn: buildPrn({
        status: {
          currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
          history: []
        },
        lastAppliedEventNumber: SEED_NUMBER
      }),
      newStatus: PRN_STATUS.CANCELLED,
      actor: PRN_ACTOR.SIGNATORY
    })

    expect(appendEvents.mock.invocationCallOrder[0]).toBeLessThan(
      persistProjection.mock.invocationCallOrder[0]
    )
    expect(persistProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        projection: expect.objectContaining({
          lastAppliedEventNumber: APPENDED_WATERMARK
        })
      })
    )
  })

  it('leaves the appended event in place when persistProjection fails on creation', async () => {
    const persistProjection = vi
      .fn()
      .mockRejectedValue(new Error('doc write failed'))
    const prnRepository = { findById: vi.fn(), persistProjection }
    const ledgerRepository = buildSeededLedgerRepository()

    await expect(
      callUpdate({
        prnRepository,
        ledgerRepository,
        organisationsRepository: buildOrganisationsRepository(),
        providedPrn: buildPrn({
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER
      })
    ).rejects.toThrow('doc write failed')

    const all = await ledgerRepository.findAllInLedger(REG_ID, ACC_ID)
    expect(all).toHaveLength(2)
    expect(all.at(-1)?.kind).toBe(LEDGER_EVENT_KIND.PRN_CREATED)
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
    const ledgerRepository = buildSeededLedgerRepository()

    await callUpdate({
      prnRepository,
      ledgerRepository,
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
    const ledgerRepository = buildSeededLedgerRepository()

    await expect(
      callUpdate({
        prnRepository,
        ledgerRepository,
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
    const ledgerRepository = buildSeededLedgerRepository()

    await expect(
      callUpdate({
        prnRepository,
        ledgerRepository,
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
    const ledgerRepository = buildSeededLedgerRepository()

    await expect(
      callUpdate({
        prnRepository,
        ledgerRepository,
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

  it('leaves the appended event in place when persistProjection fails on issuance', async () => {
    const persistProjection = vi
      .fn()
      .mockRejectedValue(new Error('doc write failed'))
    const prnRepository = { findById: vi.fn(), persistProjection }
    const ledgerRepository = buildSeededLedgerRepository()

    await expect(
      callUpdate({
        prnRepository,
        ledgerRepository,
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

    const all = await ledgerRepository.findAllInLedger(REG_ID, ACC_ID)
    expect(all).toHaveLength(2)
    expect(all.at(-1)?.kind).toBe(LEDGER_EVENT_KIND.PRN_ISSUED)
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
    const { packagingRecyclingNotesRepository, ledgerRepository } =
      buildLedgerRepositories(storedPrn, [
        buildLedgerEvent(LEDGER_EVENT_KIND.PRN_CREATED, 1),
        buildLedgerEvent(LEDGER_EVENT_KIND.PRN_ISSUED, 2)
      ])

    const projected = await getProjectedPrnByNumber({
      packagingRecyclingNotesRepository,
      ledgerRepository,
      prnNumber: PRN_NUMBER
    })
    expect(projected?.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)

    const accepted = await callUpdate({
      prnRepository: packagingRecyclingNotesRepository,
      ledgerRepository,
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
