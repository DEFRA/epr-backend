import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  PRN_STATUS,
  PRN_ACTOR,
  StatusConflictError,
  SuspendedAccreditationError,
  UnauthorisedTransitionError
} from '#packaging-recycling-notes/domain/model.js'
import { REGULATOR } from '#domain/organisations/model.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'
import { PrnNumberConflictError } from '#packaging-recycling-notes/repository/port.js'
import {
  createMockOrganisationsRepository,
  createMockPackagingRecyclingNotesRepository,
  createMockWasteBalancesRepository
} from '#test/mock-repositories.js'
import { createMockLogger } from '#test/mock-logger.js'

const mockRecordStatusTransition = vi.fn()

vi.mock('./metrics.js', () => ({
  prnMetrics: {
    recordStatusTransition: (...args) => mockRecordStatusTransition(...args)
  }
}))

const { updatePrnStatus } = await import('./update-status.js')

const defaultOrganisationsRepository = createMockOrganisationsRepository({
  findAccreditationById: vi.fn().mockResolvedValue({
    submittedToRegulator: REGULATOR.EA
  })
})

const mockLogger = createMockLogger()

const createMockPrnRepository = createMockPackagingRecyclingNotesRepository

const APPENDED_EVENT_NUMBER = 7

/**
 * A valid appended stream event, as the ledger-path balance effects return one.
 * The fold reads `kind`, `number`, `createdAt` and `createdBy` off it, so each
 * field must be present for the projection to form.
 *
 * @param {import('#waste-balances/repository/stream-schema.js').StreamEventKind} kind
 */
const buildAppendedEvent = (kind) => ({
  id: `event-${APPENDED_EVENT_NUMBER}`,
  registrationId: 'reg-123',
  accreditationId: 'acc-456',
  organisationId: 'org-123',
  number: APPENDED_EVENT_NUMBER,
  kind,
  payload: { prnId: '507f1f77bcf86cd799439011', amount: 50 },
  openingBalance: { amount: 1000, availableAmount: 1000 },
  closingBalance: { amount: 1000, availableAmount: 950 },
  createdAt: new Date('2026-02-03T10:00:00.000Z'),
  createdBy: { id: 'user-789', name: 'Test User' }
})

describe('updatePrnStatus', () => {
  beforeEach(() => {
    mockRecordStatusTransition.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })
  it('throws not found when PRN does not exist', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue(null)
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository()

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toThrow('PRN not found')
  })

  it('throws not found when PRN belongs to different organisation', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'different-org' },
        accreditation: { id: 'acc-456' },
        status: { currentStatus: PRN_STATUS.DRAFT }
      })
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository()

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toThrow('PRN not found')
  })

  it('throws not found when PRN belongs to different accreditation', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'different-acc' },
        status: { currentStatus: PRN_STATUS.DRAFT }
      })
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository()

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toThrow('PRN not found')
  })

  it('throws StatusConflictError when no transition exists between statuses', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456' },
        status: { currentStatus: PRN_STATUS.DRAFT }
      })
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository()

    // DRAFT cannot transition directly to AWAITING_ACCEPTANCE (must go via AWAITING_AUTHORISATION)
    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toThrow(StatusConflictError)
  })

  it('throws UnauthorisedTransitionError when actor is not permitted for transition', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456' },
        status: { currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE }
      })
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository()

    // Only PRODUCER can transition from awaiting_acceptance to accepted
    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.ACCEPTED,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toThrow(UnauthorisedTransitionError)
  })

  it('throws UnauthorisedTransitionError when signatory tries producer transition', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456' },
        status: { currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE }
      })
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository()

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.ACCEPTED,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toThrow(UnauthorisedTransitionError)
  })

  it('deducts available waste balance when transitioning to awaiting_authorisation', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456' },
        tonnage: 100,
        version: 1,
        status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
      }),
      persistProjection: vi
        .fn()
        .mockImplementation(async ({ projection }) => projection)
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository({
      findBalance: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
      deductAvailableBalanceForPrnCreation: vi
        .fn()
        .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_CREATED))
    })

    await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository: defaultOrganisationsRepository,
      logger: mockLogger,
      id: '507f1f77bcf86cd799439011',
      organisationId: 'org-123',
      registrationId: 'reg-123',
      accreditationId: 'acc-456',
      newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
      user: { id: 'user-789', name: 'Test User' }
    })

    expect(
      wasteBalancesRepository.deductAvailableBalanceForPrnCreation
    ).toHaveBeenCalledWith({
      accreditationId: 'acc-456',
      organisationId: 'org-123',
      prnId: '507f1f77bcf86cd799439011',
      tonnage: 100,
      registrationId: 'reg-123',
      createdBy: { id: 'user-789', name: 'Test User' }
    })
  })

  it('throws error when creating PRN without waste balance', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456' },
        tonnage: 100,
        status: { currentStatus: PRN_STATUS.DRAFT }
      })
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository({
      findBalance: vi.fn().mockResolvedValue(null)
    })

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toThrow('No waste balance found for accreditation: acc-456')
  })

  it('uses the provided updatedAt timestamp on a discard write', async () => {
    const explicitTimestamp = new Date('2026-01-15T12:00:00Z')
    const updatedPrn = {
      id: '507f1f77bcf86cd799439011',
      organisation: { id: 'org-123' },
      accreditation: { id: 'acc-456' },
      tonnage: 100,
      status: { currentStatus: PRN_STATUS.DISCARDED }
    }
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456' },
        tonnage: 100,
        version: 1,
        status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
      }),
      updateStatus: vi.fn().mockResolvedValue(updatedPrn)
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository()

    await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository: defaultOrganisationsRepository,
      logger: mockLogger,
      id: '507f1f77bcf86cd799439011',
      organisationId: 'org-123',
      registrationId: 'reg-123',
      accreditationId: 'acc-456',
      newStatus: PRN_STATUS.DISCARDED,
      actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
      user: { id: 'user-789', name: 'Test User' },
      updatedAt: explicitTimestamp
    })

    expect(prnRepository.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedAt: explicitTimestamp
      })
    )
  })

  it('persists the folded projection and returns it on a creation', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456' },
        tonnage: 100,
        version: 1,
        status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
      }),
      persistProjection: vi
        .fn()
        .mockImplementation(async ({ projection }) => projection)
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository({
      findBalance: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
      deductAvailableBalanceForPrnCreation: vi
        .fn()
        .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_CREATED))
    })

    const result = await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository: defaultOrganisationsRepository,
      logger: mockLogger,
      id: '507f1f77bcf86cd799439011',
      organisationId: 'org-123',
      registrationId: 'reg-123',
      accreditationId: 'acc-456',
      newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
      user: { id: 'user-789', name: 'Test User' }
    })

    expect(result.status.currentStatus).toBe(PRN_STATUS.AWAITING_AUTHORISATION)
    expect(result.lastAppliedEventNumber).toBe(APPENDED_EVENT_NUMBER)
    expect(prnRepository.persistProjection).toHaveBeenCalledWith({
      projection: expect.objectContaining({
        status: expect.objectContaining({
          currentStatus: PRN_STATUS.AWAITING_AUTHORISATION
        }),
        lastAppliedEventNumber: APPENDED_EVENT_NUMBER
      }),
      expectedVersion: 1
    })
  })

  it('generates PRN number when issuing (transitioning to awaiting_acceptance)', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456', accreditationYear: 2026 },
        isExport: false,
        tonnage: 50,
        version: 1,
        status: {
          currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          history: []
        }
      }),
      persistProjection: vi
        .fn()
        .mockImplementation(async ({ projection }) => projection)
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository({
      findBalance: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
      deductTotalBalanceForPrnIssue: vi
        .fn()
        .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_ISSUED))
    })

    const result = await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository: defaultOrganisationsRepository,
      logger: mockLogger,
      id: '507f1f77bcf86cd799439011',
      organisationId: 'org-123',
      registrationId: 'reg-123',
      accreditationId: 'acc-456',
      newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      actor: PRN_ACTOR.SIGNATORY,
      user: { id: 'user-789', name: 'Test User' }
    })

    expect(result.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
    expect(result.prnNumber).toMatch(/^ER26\d{5}$/)
    expect(prnRepository.persistProjection).toHaveBeenCalledWith({
      projection: expect.objectContaining({
        status: expect.objectContaining({
          currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE
        }),
        prnNumber: expect.stringMatching(/^ER26\d{5}$/)
      }),
      expectedVersion: 1
    })
  })

  it('deducts total waste balance when issuing PRN (transitioning to awaiting_acceptance)', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456', accreditationYear: 2026 },
        isExport: false,
        tonnage: 75,
        version: 1,
        status: {
          currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          history: []
        }
      }),
      persistProjection: vi
        .fn()
        .mockImplementation(async ({ projection }) => projection)
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository({
      findBalance: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
      deductTotalBalanceForPrnIssue: vi
        .fn()
        .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_ISSUED))
    })

    await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository: defaultOrganisationsRepository,
      logger: mockLogger,
      id: '507f1f77bcf86cd799439011',
      organisationId: 'org-123',
      registrationId: 'reg-123',
      accreditationId: 'acc-456',
      newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      actor: PRN_ACTOR.SIGNATORY,
      user: { id: 'user-789', name: 'Test User' }
    })

    expect(
      wasteBalancesRepository.deductTotalBalanceForPrnIssue
    ).toHaveBeenCalledWith({
      accreditationId: 'acc-456',
      organisationId: 'org-123',
      prnId: '507f1f77bcf86cd799439011',
      tonnage: 75,
      registrationId: 'reg-123',
      createdBy: { id: 'user-789', name: 'Test User' }
    })
  })

  it('throws error when issuing PRN without waste balance', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456', accreditationYear: 2026 },
        isExport: false,
        tonnage: 75,
        status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
      }),
      updateStatus: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        prnNumber: 'ER2600001',
        status: { currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE }
      })
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository({
      findBalance: vi.fn().mockResolvedValue(null)
    })

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toThrow('No waste balance found for accreditation: acc-456')
  })

  it('retries with suffix when PRN number collision occurs', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456', accreditationYear: 2026 },
        isExport: false,
        tonnage: 50,
        version: 1,
        status: {
          currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          history: []
        }
      }),
      persistProjection: vi
        .fn()
        .mockRejectedValueOnce(new PrnNumberConflictError('ER2600001'))
        .mockImplementation(async ({ projection }) => projection)
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository({
      findBalance: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
      deductTotalBalanceForPrnIssue: vi
        .fn()
        .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_ISSUED))
    })

    const result = await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      organisationsRepository: defaultOrganisationsRepository,
      logger: mockLogger,
      id: '507f1f77bcf86cd799439011',
      organisationId: 'org-123',
      registrationId: 'reg-123',
      accreditationId: 'acc-456',
      newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      actor: PRN_ACTOR.SIGNATORY,
      user: { id: 'user-789', name: 'Test User' }
    })

    expect(result.prnNumber).toMatch(/^ER26\d{5}A$/)
    expect(prnRepository.persistProjection).toHaveBeenCalledTimes(2)
    // The deduct effect is applied once; only the projection persist retries.
    expect(
      wasteBalancesRepository.deductTotalBalanceForPrnIssue
    ).toHaveBeenCalledTimes(1)
    expect(prnRepository.persistProjection).toHaveBeenLastCalledWith({
      projection: expect.objectContaining({
        prnNumber: expect.stringMatching(/^ER26\d{5}A$/)
      }),
      expectedVersion: 1
    })
  })

  it('throws error when all PRN number suffixes exhausted', async () => {
    const persistProjection = vi
      .fn()
      .mockRejectedValue(new PrnNumberConflictError('collision'))
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456', accreditationYear: 2026 },
        isExport: false,
        tonnage: 50,
        version: 1,
        status: {
          currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          history: []
        }
      }),
      // Reject all 27 attempts (no suffix + A-Z)
      persistProjection
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository({
      findBalance: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
      deductTotalBalanceForPrnIssue: vi
        .fn()
        .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_ISSUED))
    })

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toThrow('Unable to generate unique PRN number after all retries')

    expect(persistProjection).toHaveBeenCalledTimes(27) // 1 + 26 letters
  })

  it('throws error when accreditation not found during PRN issuance', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456', accreditationYear: 2026 },
        isExport: false,
        tonnage: 50,
        status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
      }),
      updateStatus: vi.fn()
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository({
      findBalance: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
      deductTotalBalanceForPrnIssue: vi.fn().mockResolvedValue({})
    })
    const organisationsRepository = createMockOrganisationsRepository({
      findAccreditationById: vi.fn().mockResolvedValue(null)
    })

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toThrow()

    expect(prnRepository.updateStatus).not.toHaveBeenCalled()
  })

  it('throws forbidden when issuing a PRN on a suspended accreditation', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456', accreditationYear: 2026 },
        isExport: false,
        tonnage: 50,
        status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
      }),
      updateStatus: vi.fn()
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository({
      findBalance: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
      deductTotalBalanceForPrnIssue: vi.fn().mockResolvedValue({})
    })
    const organisationsRepository = createMockOrganisationsRepository({
      findAccreditationById: vi.fn().mockResolvedValue({
        submittedToRegulator: REGULATOR.EA,
        status: 'suspended'
      })
    })

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toThrow(SuspendedAccreditationError)

    expect(prnRepository.updateStatus).not.toHaveBeenCalled()
  })

  it('throws non-collision errors immediately without retry', async () => {
    const dbError = new Error('Database connection failed')
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456', accreditationYear: 2026 },
        isExport: false,
        tonnage: 50,
        version: 1,
        status: {
          currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          history: []
        }
      }),
      persistProjection: vi.fn().mockRejectedValue(dbError)
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository({
      findBalance: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
      deductTotalBalanceForPrnIssue: vi
        .fn()
        .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_ISSUED))
    })

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toThrow('Database connection failed')

    expect(prnRepository.persistProjection).toHaveBeenCalledTimes(1)
  })

  it('throws bad implementation when projection persist returns null on creation', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456' },
        tonnage: 100,
        version: 1,
        status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
      }),
      persistProjection: vi.fn().mockResolvedValue(null)
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository({
      findBalance: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
      deductAvailableBalanceForPrnCreation: vi
        .fn()
        .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_CREATED))
    })

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toThrow('Failed to persist PRN projection')
  })

  it('throws error when projection persist returns null during PRN issuing', async () => {
    const prnRepository = createMockPrnRepository({
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        organisation: { id: 'org-123' },
        accreditation: { id: 'acc-456', accreditationYear: 2026 },
        isExport: false,
        tonnage: 50,
        version: 1,
        status: {
          currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          history: []
        }
      }),
      persistProjection: vi.fn().mockResolvedValue(null)
    })
    const wasteBalancesRepository = createMockWasteBalancesRepository({
      findBalance: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
      deductTotalBalanceForPrnIssue: vi
        .fn()
        .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_ISSUED))
    })

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })
    ).rejects.toThrow('Failed to persist PRN projection')
  })

  describe('negative waste balance prevention', () => {
    it('throws conflict when PRN tonnage exceeds available waste balance at creation', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456' },
          tonnage: 100,
          status: { currentStatus: PRN_STATUS.DRAFT }
        }),
        updateStatus: vi.fn()
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository({
        findBalance: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          amount: 500,
          availableAmount: 50
        }),
        deductAvailableBalanceForPrnCreation: vi.fn()
      })

      await expect(
        updatePrnStatus({
          prnRepository,
          wasteBalancesRepository,
          organisationsRepository: defaultOrganisationsRepository,
          logger: mockLogger,
          id: '507f1f77bcf86cd799439011',
          organisationId: 'org-123',
          registrationId: 'reg-123',
          accreditationId: 'acc-456',
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
          user: { id: 'user-789', name: 'Test User' }
        })
      ).rejects.toThrow('Insufficient available waste balance')

      expect(
        wasteBalancesRepository.deductAvailableBalanceForPrnCreation
      ).not.toHaveBeenCalled()
      expect(prnRepository.updateStatus).not.toHaveBeenCalled()
    })

    it('throws conflict when PRN tonnage exceeds total waste balance at issue', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456', accreditationYear: 2026 },
          isExport: false,
          tonnage: 100,
          version: 1,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        persistProjection: vi.fn()
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository({
        findBalance: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          amount: 50,
          availableAmount: 200
        }),
        deductTotalBalanceForPrnIssue: vi.fn()
      })

      await expect(
        updatePrnStatus({
          prnRepository,
          wasteBalancesRepository,
          organisationsRepository: defaultOrganisationsRepository,
          logger: mockLogger,
          id: '507f1f77bcf86cd799439011',
          organisationId: 'org-123',
          registrationId: 'reg-123',
          accreditationId: 'acc-456',
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          actor: PRN_ACTOR.SIGNATORY,
          user: { id: 'user-789', name: 'Test User' }
        })
      ).rejects.toThrow('Insufficient total waste balance')

      expect(
        wasteBalancesRepository.deductTotalBalanceForPrnIssue
      ).not.toHaveBeenCalled()
      expect(prnRepository.persistProjection).not.toHaveBeenCalled()
    })

    it('allows creation when tonnage equals available waste balance exactly', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456' },
          tonnage: 100,
          version: 1,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        persistProjection: vi
          .fn()
          .mockImplementation(async ({ projection }) => projection)
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository({
        findBalance: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          amount: 500,
          availableAmount: 100
        }),
        deductAvailableBalanceForPrnCreation: vi
          .fn()
          .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_CREATED))
      })

      await updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
        user: { id: 'user-789', name: 'Test User' }
      })

      expect(
        wasteBalancesRepository.deductAvailableBalanceForPrnCreation
      ).toHaveBeenCalled()
    })

    it('treats undefined available balance as zero', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456' },
          tonnage: 1,
          status: { currentStatus: PRN_STATUS.DRAFT }
        }),
        updateStatus: vi.fn()
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository({
        findBalance: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          amount: 500
        })
      })

      await expect(
        updatePrnStatus({
          prnRepository,
          wasteBalancesRepository,
          organisationsRepository: defaultOrganisationsRepository,
          logger: mockLogger,
          id: '507f1f77bcf86cd799439011',
          organisationId: 'org-123',
          registrationId: 'reg-123',
          accreditationId: 'acc-456',
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
          user: { id: 'user-789', name: 'Test User' }
        })
      ).rejects.toThrow('Insufficient available waste balance')
    })

    it('treats undefined total balance as zero', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456', accreditationYear: 2026 },
          isExport: false,
          tonnage: 1,
          status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
        }),
        updateStatus: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          prnNumber: 'ER2600001',
          status: { currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE }
        })
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository({
        findBalance: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          availableAmount: 200
        })
      })

      await expect(
        updatePrnStatus({
          prnRepository,
          wasteBalancesRepository,
          organisationsRepository: defaultOrganisationsRepository,
          logger: mockLogger,
          id: '507f1f77bcf86cd799439011',
          organisationId: 'org-123',
          registrationId: 'reg-123',
          accreditationId: 'acc-456',
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          actor: PRN_ACTOR.SIGNATORY,
          user: { id: 'user-789', name: 'Test User' }
        })
      ).rejects.toThrow('Insufficient total waste balance')
    })

    it('allows issue when tonnage equals total waste balance exactly', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456', accreditationYear: 2026 },
          isExport: false,
          tonnage: 50,
          version: 1,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        persistProjection: vi
          .fn()
          .mockImplementation(async ({ projection }) => projection)
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository({
        findBalance: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          amount: 50,
          availableAmount: 200
        }),
        deductTotalBalanceForPrnIssue: vi
          .fn()
          .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_ISSUED))
      })

      await updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })

      expect(
        wasteBalancesRepository.deductTotalBalanceForPrnIssue
      ).toHaveBeenCalled()
    })
  })

  describe('metrics', () => {
    it('records status transition metric on successful update', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456', material: 'paper' },
          tonnage: 100,
          isExport: false,
          version: 1,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        persistProjection: vi
          .fn()
          .mockImplementation(async ({ projection }) => projection)
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository({
        findBalance: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          amount: 1000,
          availableAmount: 1000
        }),
        deductAvailableBalanceForPrnCreation: vi
          .fn()
          .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_CREATED))
      })

      await updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
        user: { id: 'user-789', name: 'Test User' }
      })

      expect(mockRecordStatusTransition).toHaveBeenCalledWith({
        fromStatus: PRN_STATUS.DRAFT,
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        material: 'paper',
        isExport: false
      })
    })

    it('records status transition metric when issuing PRN', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: {
            id: 'acc-456',
            material: 'plastic',
            accreditationYear: 2026
          },
          tonnage: 50,
          isExport: true,
          version: 1,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        persistProjection: vi
          .fn()
          .mockImplementation(async ({ projection }) => projection)
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository({
        findBalance: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          amount: 1000,
          availableAmount: 1000
        }),
        deductTotalBalanceForPrnIssue: vi
          .fn()
          .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_ISSUED))
      })

      await updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })

      expect(mockRecordStatusTransition).toHaveBeenCalledWith({
        fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        toStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        material: 'plastic',
        isExport: true
      })
    })

    it('does not record metric when PRN not found', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue(null)
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository()

      await expect(
        updatePrnStatus({
          prnRepository,
          wasteBalancesRepository,
          organisationsRepository: defaultOrganisationsRepository,
          logger: mockLogger,
          id: '507f1f77bcf86cd799439011',
          organisationId: 'org-123',
          registrationId: 'reg-123',
          accreditationId: 'acc-456',
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
          user: { id: 'user-789', name: 'Test User' }
        })
      ).rejects.toThrow('PRN not found')

      expect(mockRecordStatusTransition).not.toHaveBeenCalled()
    })

    it('does not record metric when status transition is invalid', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456' },
          status: { currentStatus: PRN_STATUS.DRAFT }
        })
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository()

      await expect(
        updatePrnStatus({
          prnRepository,
          wasteBalancesRepository,
          organisationsRepository: defaultOrganisationsRepository,
          logger: mockLogger,
          id: '507f1f77bcf86cd799439011',
          organisationId: 'org-123',
          registrationId: 'reg-123',
          accreditationId: 'acc-456',
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
          user: { id: 'user-789', name: 'Test User' }
        })
      ).rejects.toThrow(StatusConflictError)

      expect(mockRecordStatusTransition).not.toHaveBeenCalled()
    })
  })

  describe('discarding from draft', () => {
    it('allows transition from draft to discarded', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456' },
          tonnage: 50,
          material: 'plastic',
          isExport: false,
          status: { currentStatus: PRN_STATUS.DRAFT }
        }),
        updateStatus: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          status: { currentStatus: PRN_STATUS.DISCARDED }
        })
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository()

      const result = await updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.DISCARDED,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
        user: { id: 'user-789', name: 'Test User' }
      })

      expect(result.status.currentStatus).toBe(PRN_STATUS.DISCARDED)
      expect(prnRepository.updateStatus).toHaveBeenCalledWith({
        id: '507f1f77bcf86cd799439011',
        status: PRN_STATUS.DISCARDED,
        updatedBy: { id: 'user-789', name: 'Test User' },
        updatedAt: expect.any(Date)
      })
    })

    it('throws when the discard write does not return the updated PRN', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456' },
          tonnage: 50,
          material: 'plastic',
          isExport: false,
          status: { currentStatus: PRN_STATUS.DRAFT }
        }),
        updateStatus: vi.fn().mockResolvedValue(null)
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository()

      await expect(
        updatePrnStatus({
          prnRepository,
          wasteBalancesRepository,
          organisationsRepository: defaultOrganisationsRepository,
          logger: mockLogger,
          id: '507f1f77bcf86cd799439011',
          organisationId: 'org-123',
          registrationId: 'reg-123',
          accreditationId: 'acc-456',
          newStatus: PRN_STATUS.DISCARDED,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
          user: { id: 'user-789', name: 'Test User' }
        })
      ).rejects.toThrow('Failed to update PRN status')
    })

    it('does not credit waste balance when discarding from draft', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456' },
          tonnage: 50,
          material: 'plastic',
          isExport: false,
          status: { currentStatus: PRN_STATUS.DRAFT }
        }),
        updateStatus: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          status: { currentStatus: PRN_STATUS.DISCARDED }
        })
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository({
        creditAvailableBalanceForPrnCancellation: vi.fn()
      })

      await updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.DISCARDED,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
        user: { id: 'user-789', name: 'Test User' }
      })

      expect(
        wasteBalancesRepository.creditAvailableBalanceForPrnCancellation
      ).not.toHaveBeenCalled()
    })

    it('rejects discard transition from non-draft status', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456' },
          tonnage: 50,
          status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
        })
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository()

      await expect(
        updatePrnStatus({
          prnRepository,
          wasteBalancesRepository,
          organisationsRepository: defaultOrganisationsRepository,
          logger: mockLogger,
          id: '507f1f77bcf86cd799439011',
          organisationId: 'org-123',
          registrationId: 'reg-123',
          accreditationId: 'acc-456',
          newStatus: PRN_STATUS.DISCARDED,
          actor: PRN_ACTOR.SIGNATORY,
          user: { id: 'user-789', name: 'Test User' }
        })
      ).rejects.toThrow(StatusConflictError)
    })
  })

  describe('post-issue cancellation waste balance reversal', () => {
    it('credits both amount and availableAmount when confirming cancellation of issued PRN', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456' },
          tonnage: 60,
          version: 1,
          status: {
            currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
            history: []
          }
        }),
        persistProjection: vi
          .fn()
          .mockImplementation(async ({ projection }) => projection)
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository({
        findBalance: vi.fn().mockResolvedValue({ accreditationId: 'acc-456' }),
        creditFullBalanceForIssuedPrnCancellation: vi
          .fn()
          .mockResolvedValue(
            buildAppendedEvent(STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE)
          )
      })

      await updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.CANCELLED,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })

      expect(
        wasteBalancesRepository.creditFullBalanceForIssuedPrnCancellation
      ).toHaveBeenCalledWith({
        accreditationId: 'acc-456',
        organisationId: 'org-123',
        prnId: '507f1f77bcf86cd799439011',
        tonnage: 60,
        registrationId: 'reg-123',
        createdBy: { id: 'user-789', name: 'Test User' }
      })
    })

    it('throws error when cancelling issued PRN without waste balance', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456' },
          tonnage: 60,
          status: { currentStatus: PRN_STATUS.AWAITING_CANCELLATION }
        }),
        updateStatus: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          status: { currentStatus: PRN_STATUS.CANCELLED }
        })
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository({
        findBalance: vi.fn().mockResolvedValue(null)
      })

      await expect(
        updatePrnStatus({
          prnRepository,
          wasteBalancesRepository,
          organisationsRepository: defaultOrganisationsRepository,
          logger: mockLogger,
          id: '507f1f77bcf86cd799439011',
          organisationId: 'org-123',
          registrationId: 'reg-123',
          accreditationId: 'acc-456',
          newStatus: PRN_STATUS.CANCELLED,
          actor: PRN_ACTOR.SIGNATORY,
          user: { id: 'user-789', name: 'Test User' }
        })
      ).rejects.toThrow('No waste balance found for accreditation: acc-456')
    })
  })

  describe('deletion waste balance credit', () => {
    it('credits available waste balance when deleting from awaiting_authorisation', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456' },
          tonnage: 75,
          material: 'paper',
          isExport: false,
          version: 1,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        persistProjection: vi
          .fn()
          .mockImplementation(async ({ projection }) => projection)
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository({
        findBalance: vi.fn().mockResolvedValue({ accreditationId: 'acc-456' }),
        creditAvailableBalanceForPrnCancellation: vi
          .fn()
          .mockResolvedValue(
            buildAppendedEvent(STREAM_EVENT_KIND.PRN_CREATION_CANCELLED)
          )
      })

      await updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        organisationsRepository: defaultOrganisationsRepository,
        logger: mockLogger,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        registrationId: 'reg-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.DELETED,
        actor: PRN_ACTOR.SIGNATORY,
        user: { id: 'user-789', name: 'Test User' }
      })

      expect(
        wasteBalancesRepository.creditAvailableBalanceForPrnCancellation
      ).toHaveBeenCalledWith({
        accreditationId: 'acc-456',
        organisationId: 'org-123',
        prnId: '507f1f77bcf86cd799439011',
        tonnage: 75,
        registrationId: 'reg-123',
        createdBy: { id: 'user-789', name: 'Test User' }
      })
    })

    it('throws error when deleting awaiting_authorisation PRN without waste balance', async () => {
      const prnRepository = createMockPrnRepository({
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          organisation: { id: 'org-123' },
          accreditation: { id: 'acc-456' },
          tonnage: 50,
          material: 'paper',
          isExport: false,
          status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
        }),
        updateStatus: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          version: 2,
          status: { currentStatus: PRN_STATUS.DELETED }
        }),
        rollbackPendingCancellation: vi.fn().mockResolvedValue({})
      })
      const wasteBalancesRepository = createMockWasteBalancesRepository({
        findBalance: vi.fn().mockResolvedValue(null)
      })

      await expect(
        updatePrnStatus({
          prnRepository,
          wasteBalancesRepository,
          organisationsRepository: defaultOrganisationsRepository,
          logger: mockLogger,
          id: '507f1f77bcf86cd799439011',
          organisationId: 'org-123',
          registrationId: 'reg-123',
          accreditationId: 'acc-456',
          newStatus: PRN_STATUS.DELETED,
          actor: PRN_ACTOR.SIGNATORY,
          user: { id: 'user-789', name: 'Test User' }
        })
      ).rejects.toThrow('No waste balance found for accreditation: acc-456')
    })
  })
})
