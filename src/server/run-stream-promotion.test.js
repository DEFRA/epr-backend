import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { getConfig } from '#root/config.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createWasteBalancesRepository } from '#waste-balances/repository/mongodb.js'
import { createMongoStreamRepository } from '#waste-balances/repository/stream-mongodb.js'
import { computeRebuiltStream } from '#waste-balances/application/compute-rebuilt-stream.js'
import { resolveOverseasSites } from '#application/waste-records/resolve-overseas-sites.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '#waste-balances/domain/model.js'

import { runStreamPromotion } from './run-stream-promotion.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock('#root/config.js', () => ({
  getConfig: vi.fn()
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
vi.mock('#repositories/summary-logs/mongodb.js', () => ({
  createSummaryLogsRepository: vi.fn()
}))
vi.mock('#waste-balances/repository/mongodb.js', () => ({
  createWasteBalancesRepository: vi.fn()
}))
vi.mock('#waste-balances/repository/stream-mongodb.js', () => ({
  createMongoStreamRepository: vi.fn()
}))
vi.mock('#waste-balances/application/compute-rebuilt-stream.js', () => ({
  computeRebuiltStream: vi.fn()
}))
vi.mock('#application/waste-records/resolve-overseas-sites.js', () => ({
  resolveOverseasSites: vi.fn()
}))

describe('runStreamPromotion', () => {
  let mockServer
  let mockLock
  let mockConfig
  let wasteBalancesRepository
  let streamRepository
  let organisationsRepository
  let wasteRecordsRepository
  let prnRepository
  let summaryLogsRepository
  let mockFindBalances
  let mockToArray

  beforeEach(() => {
    vi.clearAllMocks()

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }

    mockToArray = vi.fn().mockResolvedValue([])
    mockFindBalances = vi.fn().mockReturnValue({ toArray: mockToArray })
    const db = {
      collection: vi.fn().mockReturnValue({ find: mockFindBalances })
    }

    mockServer = {
      db,
      locker: { lock: vi.fn().mockResolvedValue(mockLock) }
    }

    mockConfig = {
      get: vi.fn((key) => {
        if (key === 'featureFlags.wasteBalanceLedger') return true
        return undefined
      })
    }
    vi.mocked(getConfig).mockReturnValue(/** @type {*} */ (mockConfig))

    wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(null),
      flipCanonicalSourceToMigrating: vi.fn().mockResolvedValue({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      }),
      flipCanonicalSourceToLedger: vi.fn().mockResolvedValue({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
      }),
      resetCanonicalSourceToEmbedded: vi.fn().mockResolvedValue({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })
    }
    vi.mocked(createWasteBalancesRepository).mockResolvedValue(
      () => wasteBalancesRepository
    )

    streamRepository = {
      appendEvent: vi.fn(),
      findLatestByPartition: vi.fn().mockResolvedValue(null),
      findLatestByPartitionAndKind: vi.fn().mockResolvedValue(null),
      findEventsByPrnIdAfter: vi.fn().mockResolvedValue([]),
      deleteByPartition: vi.fn().mockResolvedValue(0),
      bulkAppendEvents: vi.fn().mockResolvedValue([])
    }
    vi.mocked(createMongoStreamRepository).mockResolvedValue(
      () => streamRepository
    )

    organisationsRepository = {
      findById: vi.fn().mockResolvedValue({
        id: 'org-1',
        registrations: [],
        accreditations: []
      })
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

    summaryLogsRepository = {
      findAllByOrgReg: vi.fn().mockResolvedValue([])
    }
    vi.mocked(createSummaryLogsRepository).mockResolvedValue(
      () => summaryLogsRepository
    )

    vi.mocked(createOverseasSitesRepository).mockResolvedValue(
      () => /** @type {*} */ ({})
    )
    vi.mocked(resolveOverseasSites).mockResolvedValue(/** @type {*} */ ([]))
    vi.mocked(computeRebuiltStream).mockReturnValue({
      events: [],
      amount: 0,
      availableAmount: 0,
      backfilledActorCount: 0
    })
  })

  it('skips when feature flag is off', async () => {
    mockConfig.get = vi.fn((key) => {
      if (key === 'featureFlags.wasteBalanceLedger') return false
      return undefined
    })

    await runStreamPromotion(mockServer)

    expect(mockServer.locker.lock).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('disabled')
      })
    )
  })

  it('skips when lock cannot be obtained', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runStreamPromotion(mockServer)

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Unable to obtain lock')
      })
    )
  })

  it('frees the lock even when an error occurs', async () => {
    vi.mocked(createWasteBalancesRepository).mockRejectedValue(
      new Error('boom')
    )

    await runStreamPromotion(mockServer)

    expect(mockLock.free).toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
  })

  it('recovers stuck migrating accreditations before the main pass', async () => {
    // Recovery pass: find migrating balances and reset them
    const migratingToArray = vi
      .fn()
      .mockResolvedValue([{ accreditationId: 'acc-stuck' }])
    const embeddedToArray = vi.fn().mockResolvedValue([])

    mockFindBalances
      .mockReturnValueOnce({ toArray: migratingToArray }) // recovery query
      .mockReturnValueOnce({ toArray: embeddedToArray }) // main pass query

    await runStreamPromotion(mockServer)

    expect(
      wasteBalancesRepository.resetCanonicalSourceToEmbedded
    ).toHaveBeenCalledWith({
      accreditationId: 'acc-stuck'
    })
  })

  it('promotes an embedded accreditation through the full lifecycle', async () => {
    const migratingToArray = vi.fn().mockResolvedValue([])
    const embeddedToArray = vi.fn().mockResolvedValue([
      {
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        registrationId: 'reg-1'
      }
    ])

    mockFindBalances
      .mockReturnValueOnce({ toArray: migratingToArray })
      .mockReturnValueOnce({ toArray: embeddedToArray })

    organisationsRepository.findById.mockResolvedValue({
      id: 'org-1',
      registrations: [
        {
          id: 'reg-1',
          accreditationId: 'acc-1',
          registrationNumber: 'CBDU1',
          status: 'approved'
        }
      ],
      accreditations: [
        { id: 'acc-1', accreditationNumber: 'CBDA1', status: 'approved' }
      ]
    })

    wasteBalancesRepository.findByAccreditationId
      .mockResolvedValueOnce({
        accreditationId: 'acc-1',
        version: 1,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })
      .mockResolvedValueOnce({
        accreditationId: 'acc-1',
        version: 1,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      })

    summaryLogsRepository.findAllByOrgReg.mockResolvedValue([
      {
        summaryLog: {
          file: { id: 'file-1' },
          status: 'submitted',
          submittedAt: '2026-01-15T10:00:00.000Z'
        }
      },
      {
        summaryLog: {
          file: { id: 'file-2' },
          status: 'draft',
          submittedAt: undefined
        }
      }
    ])

    const builtEvents = /** @type {*} */ ([
      { registrationId: 'reg-1', accreditationId: 'acc-1', number: 1 }
    ])
    vi.mocked(computeRebuiltStream).mockReturnValue({
      events: builtEvents,
      amount: 100,
      availableAmount: 100,
      backfilledActorCount: 0
    })

    await runStreamPromotion(mockServer)

    // Step d: flip embedded -> migrating
    expect(
      wasteBalancesRepository.flipCanonicalSourceToMigrating
    ).toHaveBeenCalledWith({
      accreditationId: 'acc-1',
      capturedVersion: 1
    })

    // Step e: delete existing stream (idempotency)
    expect(streamRepository.deleteByPartition).toHaveBeenCalledWith(
      'reg-1',
      'acc-1'
    )

    // Step f: bulk append rebuilt events
    expect(streamRepository.bulkAppendEvents).toHaveBeenCalledWith(builtEvents)

    // Step h: flip migrating -> ledger
    expect(
      wasteBalancesRepository.flipCanonicalSourceToLedger
    ).toHaveBeenCalledWith({
      accreditationId: 'acc-1',
      capturedVersion: 1
    })

    // Summary logged
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('promoted=1')
      })
    )
  })

  it('counts as failed when a concurrent mutation bumps version during migration', async () => {
    const migratingToArray = vi.fn().mockResolvedValue([])
    const embeddedToArray = vi.fn().mockResolvedValue([
      {
        accreditationId: 'acc-race',
        organisationId: 'org-1',
        registrationId: 'reg-1'
      }
    ])

    mockFindBalances
      .mockReturnValueOnce({ toArray: migratingToArray })
      .mockReturnValueOnce({ toArray: embeddedToArray })

    organisationsRepository.findById.mockResolvedValue({
      id: 'org-1',
      registrations: [
        {
          id: 'reg-1',
          accreditationId: 'acc-race',
          registrationNumber: 'CBDU1',
          status: 'approved'
        }
      ],
      accreditations: [
        { id: 'acc-race', accreditationNumber: 'CBDA1', status: 'approved' }
      ]
    })

    // First read: version 1 (used for flipToMigrating)
    // Second read: version 2 (a PRN op bumped it during migration)
    wasteBalancesRepository.findByAccreditationId
      .mockResolvedValueOnce({
        accreditationId: 'acc-race',
        version: 1,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })
      .mockResolvedValueOnce({
        accreditationId: 'acc-race',
        version: 2,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      })

    // flipToLedger should use the ORIGINAL version (1), which won't match
    // the live document (version 2), so it no-ops
    wasteBalancesRepository.flipCanonicalSourceToLedger.mockResolvedValue({
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
    })

    await runStreamPromotion(mockServer)

    // flipToLedger must use the pre-migration version, not the re-read
    expect(
      wasteBalancesRepository.flipCanonicalSourceToLedger
    ).toHaveBeenCalledWith({
      accreditationId: 'acc-race',
      capturedVersion: 1
    })

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/failed=1/)
      })
    )
  })

  it('skips an accreditation that is already on the ledger after flip-to-migrating', async () => {
    const migratingToArray = vi.fn().mockResolvedValue([])
    const embeddedToArray = vi.fn().mockResolvedValue([
      {
        accreditationId: 'acc-ledger',
        organisationId: 'org-1',
        registrationId: 'reg-1'
      }
    ])

    mockFindBalances
      .mockReturnValueOnce({ toArray: migratingToArray })
      .mockReturnValueOnce({ toArray: embeddedToArray })

    organisationsRepository.findById.mockResolvedValue({
      id: 'org-1',
      registrations: [
        {
          id: 'reg-1',
          accreditationId: 'acc-ledger',
          registrationNumber: 'CBDU1',
          status: 'approved'
        }
      ],
      accreditations: [
        { id: 'acc-ledger', accreditationNumber: 'CBDA1', status: 'approved' }
      ]
    })

    wasteBalancesRepository.findByAccreditationId.mockResolvedValue({
      accreditationId: 'acc-ledger',
      version: 3,
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
    })

    wasteBalancesRepository.flipCanonicalSourceToMigrating.mockResolvedValue({
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
    })

    await runStreamPromotion(mockServer)

    expect(streamRepository.deleteByPartition).not.toHaveBeenCalled()
    expect(streamRepository.bulkAppendEvents).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('skipped=1')
      })
    )
  })

  it('promotes an empty accreditation with no events', async () => {
    const migratingToArray = vi.fn().mockResolvedValue([])
    const embeddedToArray = vi.fn().mockResolvedValue([
      {
        accreditationId: 'acc-empty',
        organisationId: 'org-1',
        registrationId: 'reg-1'
      }
    ])

    mockFindBalances
      .mockReturnValueOnce({ toArray: migratingToArray })
      .mockReturnValueOnce({ toArray: embeddedToArray })

    organisationsRepository.findById.mockResolvedValue({
      id: 'org-1',
      registrations: [
        {
          id: 'reg-1',
          accreditationId: 'acc-empty',
          registrationNumber: 'CBDU1',
          status: 'approved'
        }
      ],
      accreditations: [
        { id: 'acc-empty', accreditationNumber: 'CBDA1', status: 'approved' }
      ]
    })

    wasteBalancesRepository.findByAccreditationId
      .mockResolvedValueOnce({
        accreditationId: 'acc-empty',
        version: 1,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      })
      .mockResolvedValueOnce({
        accreditationId: 'acc-empty',
        version: 1,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      })

    // computeRebuiltStream returns no events (default mock)

    await runStreamPromotion(mockServer)

    // bulkAppendEvents is still called (no-op for empty array)
    expect(streamRepository.bulkAppendEvents).toHaveBeenCalledWith([])
    // Still flips to ledger
    expect(
      wasteBalancesRepository.flipCanonicalSourceToLedger
    ).toHaveBeenCalled()
  })

  it('counts as failed when accreditation is not found on organisation', async () => {
    const migratingToArray = vi.fn().mockResolvedValue([])
    const embeddedToArray = vi.fn().mockResolvedValue([
      {
        accreditationId: 'acc-missing',
        organisationId: 'org-1',
        registrationId: 'reg-1'
      }
    ])

    mockFindBalances
      .mockReturnValueOnce({ toArray: migratingToArray })
      .mockReturnValueOnce({ toArray: embeddedToArray })

    wasteBalancesRepository.findByAccreditationId.mockResolvedValue({
      accreditationId: 'acc-missing',
      version: 1,
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
    })

    // Default org mock has empty accreditations array

    await runStreamPromotion(mockServer)

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('failed=1')
      })
    )
  })

  it('promotes with empty stream when no active registration exists', async () => {
    const migratingToArray = vi.fn().mockResolvedValue([])
    const embeddedToArray = vi.fn().mockResolvedValue([
      {
        accreditationId: 'acc-noreg',
        organisationId: 'org-1',
        registrationId: 'reg-1'
      }
    ])

    mockFindBalances
      .mockReturnValueOnce({ toArray: migratingToArray })
      .mockReturnValueOnce({ toArray: embeddedToArray })

    wasteBalancesRepository.findByAccreditationId.mockResolvedValue({
      accreditationId: 'acc-noreg',
      version: 1,
      amount: 0,
      availableAmount: 0,
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
    })

    organisationsRepository.findById.mockResolvedValue({
      id: 'org-1',
      registrations: [],
      accreditations: [
        { id: 'acc-noreg', accreditationNumber: 'CBDA1', status: 'approved' }
      ]
    })

    await runStreamPromotion(mockServer)

    // No stream writes for accreditations without active registrations
    expect(streamRepository.deleteByPartition).not.toHaveBeenCalled()
    expect(streamRepository.bulkAppendEvents).not.toHaveBeenCalled()

    // Still flips to ledger
    expect(
      wasteBalancesRepository.flipCanonicalSourceToLedger
    ).toHaveBeenCalledWith({
      accreditationId: 'acc-noreg',
      capturedVersion: 1
    })

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('no active registration')
      })
    )
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('promoted=1')
      })
    )
  })

  it('aborts promotion when no active registration but balance is non-zero', async () => {
    const migratingToArray = vi.fn().mockResolvedValue([])
    const embeddedToArray = vi.fn().mockResolvedValue([
      {
        accreditationId: 'acc-surprise',
        organisationId: 'org-1',
        registrationId: 'reg-1'
      }
    ])

    mockFindBalances
      .mockReturnValueOnce({ toArray: migratingToArray })
      .mockReturnValueOnce({ toArray: embeddedToArray })

    wasteBalancesRepository.findByAccreditationId.mockResolvedValue({
      accreditationId: 'acc-surprise',
      version: 1,
      amount: 50,
      availableAmount: 50,
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
    })

    organisationsRepository.findById.mockResolvedValue({
      id: 'org-1',
      registrations: [],
      accreditations: [
        {
          id: 'acc-surprise',
          accreditationNumber: 'CBDA1',
          status: 'approved'
        }
      ]
    })

    await runStreamPromotion(mockServer)

    // Should not promote: marker never touched, no stream writes
    expect(
      wasteBalancesRepository.flipCanonicalSourceToMigrating
    ).not.toHaveBeenCalled()
    expect(streamRepository.deleteByPartition).not.toHaveBeenCalled()

    // Counted as failed with an error log
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('non-zero balance')
      })
    )
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('failed=1')
      })
    )
  })

  it('counts as failed when no waste balance exists for accreditation', async () => {
    const migratingToArray = vi.fn().mockResolvedValue([])
    const embeddedToArray = vi.fn().mockResolvedValue([
      {
        accreditationId: 'acc-nobal',
        organisationId: 'org-1',
        registrationId: 'reg-1'
      }
    ])

    mockFindBalances
      .mockReturnValueOnce({ toArray: migratingToArray })
      .mockReturnValueOnce({ toArray: embeddedToArray })

    organisationsRepository.findById.mockResolvedValue({
      id: 'org-1',
      registrations: [
        {
          id: 'reg-1',
          accreditationId: 'acc-nobal',
          registrationNumber: 'CBDU1',
          status: 'approved'
        }
      ],
      accreditations: [
        { id: 'acc-nobal', accreditationNumber: 'CBDA1', status: 'approved' }
      ]
    })

    // findByAccreditationId returns null (default mock)

    await runStreamPromotion(mockServer)

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('failed=1')
      })
    )
  })

  it('counts as failed when flip to ledger does not land', async () => {
    const migratingToArray = vi.fn().mockResolvedValue([])
    const embeddedToArray = vi.fn().mockResolvedValue([
      {
        accreditationId: 'acc-nolift',
        organisationId: 'org-1',
        registrationId: 'reg-1'
      }
    ])

    mockFindBalances
      .mockReturnValueOnce({ toArray: migratingToArray })
      .mockReturnValueOnce({ toArray: embeddedToArray })

    organisationsRepository.findById.mockResolvedValue({
      id: 'org-1',
      registrations: [
        {
          id: 'reg-1',
          accreditationId: 'acc-nolift',
          registrationNumber: 'CBDU1',
          status: 'approved'
        }
      ],
      accreditations: [
        { id: 'acc-nolift', accreditationNumber: 'CBDA1', status: 'approved' }
      ]
    })

    wasteBalancesRepository.findByAccreditationId.mockResolvedValue({
      accreditationId: 'acc-nolift',
      version: 1,
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
    })

    wasteBalancesRepository.flipCanonicalSourceToLedger.mockResolvedValue({
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
    })

    await runStreamPromotion(mockServer)

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('will retry next boot')
      })
    )
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/failed=1/)
      })
    )
  })

  it('logs a summary with promoted, skipped, and failed counts', async () => {
    // Empty population
    const migratingToArray = vi.fn().mockResolvedValue([])
    const embeddedToArray = vi.fn().mockResolvedValue([])

    mockFindBalances
      .mockReturnValueOnce({ toArray: migratingToArray })
      .mockReturnValueOnce({ toArray: embeddedToArray })

    await runStreamPromotion(mockServer)

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/promoted=0 skipped=0 failed=0/)
      })
    )
  })
})
