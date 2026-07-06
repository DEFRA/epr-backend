import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { backfillEstateRowStates } from '#waste-records/backfill/backfill-estate-rowstates.js'

import { runBackfillWasteRecordStates } from './run-backfill-waste-record-states.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock('#waste-records/backfill/backfill-estate-rowstates.js', () => ({
  backfillEstateRowStates: vi.fn()
}))

/**
 * @param {Partial<import('#waste-records/backfill/backfill-estate-rowstates.js').EstateBackfillSummary>} [summary]
 */
const seedSummary = (summary = {}) => {
  vi.mocked(backfillEstateRowStates).mockResolvedValue({
    organisationsScanned: 0,
    streamsBackfilled: 0,
    submissionsBackfilled: 0,
    rowStateWrites: 0,
    orphanedAccreditations: [],
    ...summary
  })
}

describe('runBackfillWasteRecordStates', () => {
  let mockServer
  let mockLock

  beforeEach(() => {
    vi.clearAllMocks()

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }
    mockServer = {
      featureFlags: {
        isWasteRecordStatesBackfillEnabled: () => true
      },
      locker: {
        lock: vi.fn().mockResolvedValue(mockLock)
      },
      app: {
        organisationsRepository: { name: 'organisations' },
        wasteRecordsRepository: { name: 'wasteRecords' },
        summaryLogsRepository: { name: 'summaryLogs' },
        overseasSitesRepository: { name: 'overseasSites' },
        wasteRecordStatesRepository: { name: 'wasteRecordStates' }
      }
    }
  })

  it('does nothing when the backfill flag is off — no lock, no adapter invocation', async () => {
    mockServer.featureFlags.isWasteRecordStatesBackfillEnabled = () => false

    await runBackfillWasteRecordStates(mockServer)

    expect(mockServer.locker.lock).not.toHaveBeenCalled()
    expect(backfillEstateRowStates).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('acquires a lock scoped to the backfill and releases it afterwards', async () => {
    seedSummary()

    await runBackfillWasteRecordStates(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'waste-record-states-backfill'
    )
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('runs the estate backfill wired to the registered mongodb adapters', async () => {
    seedSummary()

    await runBackfillWasteRecordStates(mockServer)

    expect(backfillEstateRowStates).toHaveBeenCalledWith({
      organisationsRepository: mockServer.app.organisationsRepository,
      wasteRecordsRepository: mockServer.app.wasteRecordsRepository,
      summaryLogsRepository: mockServer.app.summaryLogsRepository,
      overseasSitesRepository: mockServer.app.overseasSitesRepository,
      rowStateRepository: mockServer.app.wasteRecordStatesRepository
    })
  })

  it('skips the backfill when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runBackfillWasteRecordStates(mockServer)

    expect(backfillEstateRowStates).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping waste-record-state backfill'
    })
  })

  it('logs the backfill summary counts', async () => {
    seedSummary({
      organisationsScanned: 12,
      streamsBackfilled: 8,
      submissionsBackfilled: 20,
      rowStateWrites: 140
    })

    await runBackfillWasteRecordStates(mockServer)

    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-record-state backfill complete: organisationsScanned=12 streamsBackfilled=8 submissionsBackfilled=20 rowStateWrites=140 orphanedAccreditations=0'
    })
  })

  it('logs each orphaned accreditation at warn', async () => {
    seedSummary({
      organisationsScanned: 1,
      orphanedAccreditations: [
        {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          accreditationId: 'acc-1'
        }
      ]
    })

    await runBackfillWasteRecordStates(mockServer)

    expect(logger.warn).toHaveBeenCalledWith({
      message:
        'Waste-record-state backfill orphaned accreditation: organisationId=org-1 registrationId=reg-1 accreditationId=acc-1'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-record-state backfill complete: organisationsScanned=1 streamsBackfilled=0 submissionsBackfilled=0 rowStateWrites=0 orphanedAccreditations=1'
    })
  })

  it('releases the lock and logs an error when the backfill throws', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(backfillEstateRowStates).mockRejectedValue(error)

    await runBackfillWasteRecordStates(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run waste-record-state backfill'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    mockServer.locker.lock.mockRejectedValue(error)

    await runBackfillWasteRecordStates(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run waste-record-state backfill'
    })
  })
})
