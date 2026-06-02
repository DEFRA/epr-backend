import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { computeRebuiltTotals } from '#waste-balances/application/compute-rebuilt-totals.js'
import { computeRebuiltStream } from '#waste-balances/application/compute-rebuilt-stream.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'
import { resolveOverseasSites } from '#application/waste-records/resolve-overseas-sites.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'

import { runBalanceDivergenceDiagnostic } from './run-balance-divergence-diagnostic.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))
vi.mock('#repositories/waste-records/mongodb.js', () => ({
  createWasteRecordsRepository: vi.fn()
}))
vi.mock('#packaging-recycling-notes/repository/mongodb.js', () => ({
  createPackagingRecyclingNotesRepository: vi.fn()
}))
vi.mock('#overseas-sites/repository/mongodb.js', () => ({
  createOverseasSitesRepository: vi.fn()
}))
vi.mock('#waste-balances/application/compute-rebuilt-totals.js', () => ({
  computeRebuiltTotals: vi.fn()
}))
vi.mock('#waste-balances/application/compute-rebuilt-stream.js', () => ({
  computeRebuiltStream: vi.fn()
}))
vi.mock('#application/waste-records/resolve-overseas-sites.js', () => ({
  resolveOverseasSites: vi.fn()
}))
vi.mock('#repositories/summary-logs/mongodb.js', () => ({
  createSummaryLogsRepository: vi.fn()
}))

describe('runBalanceDivergenceDiagnostic', () => {
  let mockServer
  let mockLock
  let organisationsRepository
  let wasteRecordsRepository
  let prnRepository
  let overseasSitesRepository
  let summaryLogsRepository
  let mockToArray
  let mockFind
  let collectionByName
  let registrations
  let accreditations

  const setEmbeddedBalances = (rows) => {
    mockToArray.mockResolvedValue(rows)
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }

    mockToArray = vi.fn().mockResolvedValue([])
    mockFind = vi.fn().mockReturnValue({ toArray: mockToArray })
    collectionByName = vi.fn().mockImplementation((name) => {
      if (name === 'waste-balances') {
        return { find: mockFind }
      }
      return {
        find: vi
          .fn()
          .mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })
      }
    })
    const db = { collection: collectionByName }

    mockServer = {
      db,
      locker: { lock: vi.fn().mockResolvedValue(mockLock) }
    }

    registrations = {}
    accreditations = {}

    organisationsRepository = {
      findById: vi.fn(async (orgId) => ({
        id: orgId,
        registrations: registrations[orgId] ?? [],
        accreditations: accreditations[orgId] ?? []
      }))
    }
    vi.mocked(createOrganisationsRepository).mockResolvedValue(
      () => organisationsRepository
    )

    wasteRecordsRepository = {
      findByRegistration: vi.fn().mockResolvedValue([])
    }
    vi.mocked(createWasteRecordsRepository).mockResolvedValue(
      () => wasteRecordsRepository
    )

    prnRepository = {
      findByAccreditation: vi.fn().mockResolvedValue([])
    }
    vi.mocked(createPackagingRecyclingNotesRepository).mockResolvedValue(
      () => prnRepository
    )

    overseasSitesRepository = {
      findByIds: vi.fn().mockResolvedValue([])
    }
    vi.mocked(createOverseasSitesRepository).mockResolvedValue(
      () => overseasSitesRepository
    )

    summaryLogsRepository = {
      findAllByOrgReg: vi.fn().mockResolvedValue([])
    }
    vi.mocked(createSummaryLogsRepository).mockResolvedValue(
      () => summaryLogsRepository
    )

    vi.mocked(computeRebuiltTotals).mockReturnValue(
      /** @type {any} */ ({ amount: 0, availableAmount: 0 })
    )
    vi.mocked(computeRebuiltStream).mockReturnValue({
      events: [],
      amount: 0,
      availableAmount: 0,
      backfilledActorCount: 0
    })
    vi.mocked(resolveOverseasSites).mockResolvedValue({})
  })

  it('acquires a lock scoped to the diagnostic and releases it afterwards', async () => {
    await runBalanceDivergenceDiagnostic(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'balance-divergence-diagnostic'
    )
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('skips running when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(mockServer.db.collection).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Unable to obtain lock, skipping waste-balance divergence diagnostic'
    })
  })

  it('queries waste-balances for any document whose canonicalSource is not ledger so legacy docs without the marker are scanned too', async () => {
    await runBalanceDivergenceDiagnostic(mockServer)

    expect(collectionByName).toHaveBeenCalledWith('waste-balances')
    expect(mockFind).toHaveBeenCalledWith(
      { canonicalSource: { $ne: 'ledger' } },
      expect.objectContaining({
        projection: expect.objectContaining({
          accreditationId: 1,
          organisationId: 1,
          amount: 1,
          availableAmount: 1
        })
      })
    )
  })

  it('logs a zero-count summary line when there are no embedded accreditations', async () => {
    setEmbeddedBalances([])

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance divergence diagnostic: scanned=0 changed=0 failed=0'
    })
  })

  it('emits no per-accreditation log when the rebuilt totals match the stored values', async () => {
    setEmbeddedBalances([
      {
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        amount: 7,
        availableAmount: 5
      }
    ])
    registrations['org-1'] = [
      {
        id: 'reg-1',
        accreditationId: 'acc-1',
        registrationNumber: 'REG-1',
        status: 'approved'
      }
    ]
    accreditations['org-1'] = [
      { id: 'acc-1', accreditationNumber: 'ACC-acc-1' }
    ]
    vi.mocked(computeRebuiltTotals).mockReturnValue(
      /** @type {any} */ ({ amount: 7, availableAmount: 5 })
    )
    vi.mocked(computeRebuiltStream).mockReturnValue({
      events: [],
      amount: 7,
      availableAmount: 5,
      backfilledActorCount: 0
    })

    await runBalanceDivergenceDiagnostic(mockServer)

    const perAccreditationLines = vi
      .mocked(logger.info)
      .mock.calls.filter(([arg]) =>
        /** @type {any} */ (arg).message?.startsWith(
          'Waste-balance divergence affected accreditation:'
        )
      )
    expect(perAccreditationLines).toHaveLength(0)
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance divergence diagnostic: scanned=1 changed=0 failed=0'
    })
  })

  it('emits a per-accreditation key=value line when totals diverge on either field', async () => {
    setEmbeddedBalances([
      {
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        amount: 100,
        availableAmount: 80
      }
    ])
    registrations['org-1'] = [
      {
        id: 'reg-1',
        accreditationId: 'acc-1',
        registrationNumber: 'REG-1',
        status: 'approved'
      }
    ]
    accreditations['org-1'] = [
      { id: 'acc-1', accreditationNumber: 'ACC-acc-1', status: 'approved' }
    ]
    vi.mocked(computeRebuiltTotals).mockReturnValue({
      amount: 95,
      availableAmount: 80,
      wasteRecordContribution: 95,
      prnAmountContribution: 0,
      prnAvailableAmountContribution: -15
    })
    vi.mocked(computeRebuiltStream).mockReturnValue({
      events: [],
      amount: 95,
      availableAmount: 80,
      backfilledActorCount: 0
    })

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance divergence affected accreditation: organisationId=org-1 registrationNumber=REG-1 accreditationNumber=ACC-acc-1 currentAmount=100 rebuiltAmount=95 deltaAmount=-5 currentAvailableAmount=80 rebuiltAvailableAmount=80 deltaAvailableAmount=0 registrationStatus=approved accreditationStatus=approved wasteRecordCount=0 wasteRecordContribution=95 prnCount=0 prnAmountContribution=0 prnAvailableAmountContribution=-15 streamAmount=95 streamAvailableAmount=80 streamDeltaAmount=0 streamDeltaAvailableAmount=0 streamEventCount=0'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance divergence diagnostic: scanned=1 changed=1 failed=0'
    })
  })

  it('passes the registration accreditation, waste records and PRN history into the rebuild', async () => {
    const accreditation = {
      id: 'acc-1',
      accreditationNumber: 'ACC-001'
    }
    setEmbeddedBalances([
      {
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        amount: 0,
        availableAmount: 0
      }
    ])
    registrations['org-1'] = [
      {
        id: 'reg-1',
        accreditationId: 'acc-1',
        registrationNumber: 'REG-1',
        status: 'approved'
      }
    ]
    accreditations['org-1'] = [accreditation]
    const wasteRecords = [{ rowId: 'r-1', type: 'received' }]
    const prns = [{ id: 'prn-1' }]
    wasteRecordsRepository.findByRegistration.mockResolvedValue(wasteRecords)
    prnRepository.findByAccreditation.mockResolvedValue(prns)

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(wasteRecordsRepository.findByRegistration).toHaveBeenCalledWith(
      'org-1',
      'reg-1'
    )
    expect(prnRepository.findByAccreditation).toHaveBeenCalledWith('acc-1')
    expect(computeRebuiltTotals).toHaveBeenCalledWith({
      accreditation,
      wasteRecords,
      prns,
      overseasSites: {}
    })
  })

  it('resolves overseas sites for the registration and passes them into the rebuild', async () => {
    setEmbeddedBalances([
      {
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        amount: 0,
        availableAmount: 0
      }
    ])
    registrations['org-1'] = [
      {
        id: 'reg-1',
        accreditationId: 'acc-1',
        registrationNumber: 'REG-1',
        status: 'approved'
      }
    ]
    accreditations['org-1'] = [
      { id: 'acc-1', accreditationNumber: 'ACC-acc-1' }
    ]
    vi.mocked(resolveOverseasSites).mockResolvedValue({
      '099': { validFrom: null }
    })

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(resolveOverseasSites).toHaveBeenCalledWith(
      organisationsRepository,
      overseasSitesRepository,
      'org-1',
      'reg-1'
    )
    expect(computeRebuiltTotals).toHaveBeenCalledWith(
      expect.objectContaining({
        overseasSites: { '099': { validFrom: null } }
      })
    )
  })

  it('logs accreditationNumber=<none> for accreditations that have not been issued one yet', async () => {
    setEmbeddedBalances([
      {
        accreditationId: 'acc-pending',
        organisationId: 'org-1',
        amount: 10,
        availableAmount: 10
      }
    ])
    registrations['org-1'] = [
      {
        id: 'reg-1',
        accreditationId: 'acc-pending',
        registrationNumber: 'REG-1',
        status: 'approved'
      }
    ]
    accreditations['org-1'] = [{ id: 'acc-pending', status: 'created' }]
    vi.mocked(computeRebuiltTotals).mockReturnValue({
      amount: 7,
      availableAmount: 7,
      wasteRecordContribution: 7,
      prnAmountContribution: 0,
      prnAvailableAmountContribution: 0
    })
    vi.mocked(computeRebuiltStream).mockReturnValue({
      events: [],
      amount: 7,
      availableAmount: 7,
      backfilledActorCount: 0
    })

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance divergence affected accreditation: organisationId=org-1 registrationNumber=REG-1 accreditationNumber=<none> currentAmount=10 rebuiltAmount=7 deltaAmount=-3 currentAvailableAmount=10 rebuiltAvailableAmount=7 deltaAvailableAmount=-3 registrationStatus=approved accreditationStatus=created wasteRecordCount=0 wasteRecordContribution=7 prnCount=0 prnAmountContribution=0 prnAvailableAmountContribution=0 streamAmount=7 streamAvailableAmount=7 streamDeltaAmount=0 streamDeltaAvailableAmount=0 streamEventCount=0'
    })
  })

  it('logs registration status, accreditation status and input counts so cancelled-registration zero-rebuilds are recognisable', async () => {
    setEmbeddedBalances([
      {
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        amount: 2084.27,
        availableAmount: 2084.27
      }
    ])
    registrations['org-1'] = [
      {
        id: 'reg-1',
        accreditationId: 'acc-1',
        registrationNumber: null,
        status: 'cancelled'
      }
    ]
    accreditations['org-1'] = [
      { id: 'acc-1', accreditationNumber: 'ACC-1', status: 'cancelled' }
    ]
    wasteRecordsRepository.findByRegistration.mockResolvedValue([{}, {}, {}])
    prnRepository.findByAccreditation.mockResolvedValue([{}, {}])
    vi.mocked(computeRebuiltTotals).mockReturnValue({
      amount: 0,
      availableAmount: 0,
      wasteRecordContribution: 0,
      prnAmountContribution: 0,
      prnAvailableAmountContribution: 0
    })

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance divergence affected accreditation: organisationId=org-1 registrationNumber=null accreditationNumber=ACC-1 currentAmount=2084.27 rebuiltAmount=0 deltaAmount=-2084.27 currentAvailableAmount=2084.27 rebuiltAvailableAmount=0 deltaAvailableAmount=-2084.27 registrationStatus=cancelled accreditationStatus=cancelled wasteRecordCount=3 wasteRecordContribution=0 prnCount=2 prnAmountContribution=0 prnAvailableAmountContribution=0 streamAmount=0 streamAvailableAmount=0 streamDeltaAmount=0 streamDeltaAvailableAmount=0 streamEventCount=0'
    })
  })

  it('logs a tagged error line when the only registration for an accreditation is in created or rejected state', async () => {
    setEmbeddedBalances([
      {
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        amount: 10,
        availableAmount: 10
      }
    ])
    accreditations['org-1'] = [{ id: 'acc-1', accreditationNumber: 'ACC-1' }]
    registrations['org-1'] = [
      {
        id: 'reg-1',
        accreditationId: 'acc-1',
        registrationNumber: 'REG-1',
        status: 'created'
      }
    ]

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          'No registration links to accreditation acc-1'
        )
      })
    )
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance divergence diagnostic: scanned=1 changed=0 failed=1'
    })
  })

  it('logs a tagged error line when an accreditation has no matching registration', async () => {
    setEmbeddedBalances([
      {
        accreditationId: 'acc-orphan',
        organisationId: 'org-1',
        amount: 10,
        availableAmount: 10
      }
    ])
    accreditations['org-1'] = [
      { id: 'acc-orphan', accreditationNumber: 'ACC-orphan' }
    ]
    registrations['org-1'] = []

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          'Waste-balance divergence rebuild failed: organisationId=org-1 accreditationId=acc-orphan'
        )
      })
    )
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          'No registration links to accreditation acc-orphan'
        )
      })
    )
  })

  it('logs a tagged error line and continues scanning when one accreditation fails to rebuild', async () => {
    setEmbeddedBalances([
      {
        accreditationId: 'acc-bad',
        organisationId: 'org-1',
        amount: 10,
        availableAmount: 10
      },
      {
        accreditationId: 'acc-good',
        organisationId: 'org-2',
        amount: 5,
        availableAmount: 5
      }
    ])
    registrations['org-1'] = []
    registrations['org-2'] = [
      {
        id: 'reg-good',
        accreditationId: 'acc-good',
        registrationNumber: 'REG-2',
        status: 'approved'
      }
    ]
    accreditations['org-2'] = [
      { id: 'acc-good', accreditationNumber: 'ACC-good' }
    ]
    vi.mocked(computeRebuiltTotals).mockReturnValue(
      /** @type {any} */ ({ amount: 5, availableAmount: 5 })
    )
    vi.mocked(computeRebuiltStream).mockReturnValue({
      events: [],
      amount: 5,
      availableAmount: 5,
      backfilledActorCount: 0
    })

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          'Waste-balance divergence rebuild failed: organisationId=org-1 accreditationId=acc-bad'
        )
      })
    )
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance divergence diagnostic: scanned=2 changed=0 failed=1'
    })
  })

  it('releases the lock and logs an error when the embedded query throws', async () => {
    const error = new Error('query exploded')
    mockFind.mockImplementation(() => {
      throw error
    })

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run waste-balance divergence diagnostic'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    mockServer.locker.lock.mockRejectedValue(error)

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run waste-balance divergence diagnostic'
    })
  })

  it('passes file.id (not the document _id) as the summary log identifier to computeRebuiltStream', async () => {
    const accreditation = { id: 'acc-1', accreditationNumber: 'ACC-001' }
    setEmbeddedBalances([
      {
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        amount: 0,
        availableAmount: 0
      }
    ])
    registrations['org-1'] = [
      {
        id: 'reg-1',
        accreditationId: 'acc-1',
        registrationNumber: 'REG-1',
        status: 'approved'
      }
    ]
    accreditations['org-1'] = [accreditation]
    summaryLogsRepository.findAllByOrgReg.mockResolvedValue([
      {
        id: 'doc-id-1',
        version: 1,
        summaryLog: {
          status: 'submitted',
          submittedAt: '2025-01-01T00:00:00Z',
          file: { id: 'file-id-1', name: 'test.xlsx', uri: 's3://bucket/key' }
        }
      }
    ])
    const wasteRecords = [{ rowId: 'r-1', type: 'received' }]
    wasteRecordsRepository.findByRegistration.mockResolvedValue(wasteRecords)
    const prns = [{ id: 'prn-1' }]
    prnRepository.findByAccreditation.mockResolvedValue(prns)

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(summaryLogsRepository.findAllByOrgReg).toHaveBeenCalledWith(
      'org-1',
      'reg-1'
    )
    expect(computeRebuiltStream).toHaveBeenCalledWith({
      accreditation,
      registrationId: 'reg-1',
      organisationId: 'org-1',
      wasteRecords,
      prns,
      overseasSites: {},
      summaryLogs: [
        {
          id: 'file-id-1',
          status: 'submitted',
          submittedAt: '2025-01-01T00:00:00Z'
        }
      ]
    })
  })

  it('filters out failure-status summary logs that may lack a file field before mapping', async () => {
    const accreditation = { id: 'acc-1', accreditationNumber: 'ACC-001' }
    setEmbeddedBalances([
      {
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        amount: 0,
        availableAmount: 0
      }
    ])
    registrations['org-1'] = [
      {
        id: 'reg-1',
        accreditationId: 'acc-1',
        registrationNumber: 'REG-1',
        status: 'approved'
      }
    ]
    accreditations['org-1'] = [accreditation]
    summaryLogsRepository.findAllByOrgReg.mockResolvedValue([
      {
        id: 'doc-submitted',
        version: 1,
        summaryLog: {
          status: 'submitted',
          submittedAt: '2025-01-01T00:00:00Z',
          file: { id: 'file-id-1', name: 'test.xlsx', uri: 's3://bucket/key' }
        }
      },
      {
        id: 'doc-rejected',
        version: 1,
        summaryLog: {
          status: 'rejected'
        }
      }
    ])

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(computeRebuiltStream).toHaveBeenCalledWith(
      expect.objectContaining({
        summaryLogs: [
          {
            id: 'file-id-1',
            status: 'submitted',
            submittedAt: '2025-01-01T00:00:00Z'
          }
        ]
      })
    )
  })

  it('includes stream replay figures in the divergence log when stream disagrees', async () => {
    setEmbeddedBalances([
      {
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        amount: 100,
        availableAmount: 80
      }
    ])
    registrations['org-1'] = [
      {
        id: 'reg-1',
        accreditationId: 'acc-1',
        registrationNumber: 'REG-1',
        status: 'approved'
      }
    ]
    accreditations['org-1'] = [
      { id: 'acc-1', accreditationNumber: 'ACC-1', status: 'approved' }
    ]
    vi.mocked(computeRebuiltTotals).mockReturnValue({
      amount: 100,
      availableAmount: 80,
      wasteRecordContribution: 100,
      prnAmountContribution: 0,
      prnAvailableAmountContribution: -20
    })
    vi.mocked(computeRebuiltStream).mockReturnValue({
      events: [],
      amount: 95,
      availableAmount: 75,
      backfilledActorCount: 0
    })

    await runBalanceDivergenceDiagnostic(mockServer)

    const divergenceLines = vi
      .mocked(logger.info)
      .mock.calls.filter(([arg]) =>
        /** @type {any} */ (arg).message?.startsWith(
          'Waste-balance divergence affected accreditation:'
        )
      )
    expect(divergenceLines).toHaveLength(1)
    expect(divergenceLines[0][0].message).toContain('streamAmount=95')
    expect(divergenceLines[0][0].message).toContain('streamAvailableAmount=75')
    expect(divergenceLines[0][0].message).toContain('streamEventCount=0')
  })

  it('warns with a tagged key=value line when the rebuild used the backfill actor', async () => {
    setEmbeddedBalances([
      {
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        amount: 0,
        availableAmount: 0
      }
    ])
    registrations['org-1'] = [
      {
        id: 'reg-1',
        accreditationId: 'acc-1',
        registrationNumber: 'REG-1',
        status: 'approved'
      }
    ]
    accreditations['org-1'] = [
      { id: 'acc-1', accreditationNumber: 'ACC-1', status: 'approved' }
    ]
    vi.mocked(computeRebuiltStream).mockReturnValue({
      events: [buildStreamEvent(), buildStreamEvent(), buildStreamEvent()],
      amount: 0,
      availableAmount: 0,
      backfilledActorCount: 2,
      backfilledActorCountByKind: {
        'summary-log-submitted': 1,
        'prn-created': 1
      }
    })

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(logger.warn).toHaveBeenCalledWith({
      message:
        'Waste-balance rebuild used backfill actor: organisationId=org-1 registrationNumber=REG-1 accreditationNumber=ACC-1 backfilledActorCount=2 backfilledActorCountByKind=prn-created:1,summary-log-submitted:1 streamEventCount=3'
    })
  })

  it('does not warn when every rebuilt event carried a real actor', async () => {
    setEmbeddedBalances([
      {
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        amount: 0,
        availableAmount: 0
      }
    ])
    registrations['org-1'] = [
      {
        id: 'reg-1',
        accreditationId: 'acc-1',
        registrationNumber: 'REG-1',
        status: 'approved'
      }
    ]
    accreditations['org-1'] = [
      { id: 'acc-1', accreditationNumber: 'ACC-1', status: 'approved' }
    ]
    vi.mocked(computeRebuiltStream).mockReturnValue({
      events: [buildStreamEvent()],
      amount: 0,
      availableAmount: 0,
      backfilledActorCount: 0
    })

    await runBalanceDivergenceDiagnostic(mockServer)

    expect(logger.warn).not.toHaveBeenCalled()
  })
})
