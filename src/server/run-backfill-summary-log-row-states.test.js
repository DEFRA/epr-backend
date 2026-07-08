import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { backfillEstateSummaryLogRowStates } from '#waste-records/backfill/backfill-estate-summary-log-row-states.js'

import {
  runBackfillSummaryLogRowStates,
  PROGRESS_LOG_INTERVAL
} from './run-backfill-summary-log-row-states.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock(
  '#waste-records/backfill/backfill-estate-summary-log-row-states.js',
  () => ({
    backfillEstateSummaryLogRowStates: vi.fn()
  })
)

/**
 * @param {Partial<import('#waste-records/backfill/backfill-estate-summary-log-row-states.js').EstateBackfillSummary>} [summary]
 */
const seedSummary = (summary = {}) => {
  vi.mocked(backfillEstateSummaryLogRowStates).mockResolvedValue({
    organisationsScanned: 0,
    ledgersBackfilled: 0,
    ledgersSkippedComplete: 0,
    submissionsBackfilled: 0,
    summaryLogRowStateWrites: 0,
    orphanedAccreditations: [],
    ...summary
  })
}

describe('runBackfillSummaryLogRowStates', () => {
  let mockServer
  let mockLock

  beforeEach(() => {
    vi.clearAllMocks()

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }
    mockServer = {
      featureFlags: {
        isSummaryLogRowStatesBackfillEnabled: () => true
      },
      locker: {
        lock: vi.fn().mockResolvedValue(mockLock)
      },
      app: {
        organisationsRepository: { name: 'organisations' },
        wasteRecordsRepository: { name: 'wasteRecords' },
        summaryLogsRepository: { name: 'summaryLogs' },
        overseasSitesRepository: { name: 'overseasSites' },
        summaryLogRowStatesRepository: { name: 'summaryLogRowStates' },
        summaryLogRowStatesBackfillWatermarkRepository: {
          name: 'summaryLogRowStatesBackfillWatermark'
        }
      }
    }
  })

  it('does nothing when the backfill flag is off — no lock, no adapter invocation', async () => {
    mockServer.featureFlags.isSummaryLogRowStatesBackfillEnabled = () => false

    await runBackfillSummaryLogRowStates(mockServer)

    expect(mockServer.locker.lock).not.toHaveBeenCalled()
    expect(backfillEstateSummaryLogRowStates).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('acquires a lock scoped to the backfill and releases it afterwards', async () => {
    seedSummary()

    await runBackfillSummaryLogRowStates(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'summary-log-row-states-backfill'
    )
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('runs the estate backfill wired to the registered mongodb adapters', async () => {
    seedSummary()

    await runBackfillSummaryLogRowStates(mockServer)

    expect(backfillEstateSummaryLogRowStates).toHaveBeenCalledWith({
      organisationsRepository: mockServer.app.organisationsRepository,
      wasteRecordsRepository: mockServer.app.wasteRecordsRepository,
      summaryLogsRepository: mockServer.app.summaryLogsRepository,
      overseasSitesRepository: mockServer.app.overseasSitesRepository,
      summaryLogRowStateRepository:
        mockServer.app.summaryLogRowStatesRepository,
      summaryLogRowStatesBackfillWatermarkRepository:
        mockServer.app.summaryLogRowStatesBackfillWatermarkRepository,
      onProgress: expect.any(Function)
    })
  })

  it('skips the backfill when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runBackfillSummaryLogRowStates(mockServer)

    expect(backfillEstateSummaryLogRowStates).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping summary-log-row-state backfill'
    })
  })

  it('logs the backfill summary counts', async () => {
    seedSummary({
      organisationsScanned: 12,
      ledgersBackfilled: 8,
      ledgersSkippedComplete: 3,
      submissionsBackfilled: 20,
      summaryLogRowStateWrites: 140
    })

    await runBackfillSummaryLogRowStates(mockServer)

    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-record-state backfill complete: organisationsScanned=12 ledgersBackfilled=8 ledgersSkippedComplete=3 submissionsBackfilled=20 summaryLogRowStateWrites=140 orphanedAccreditations=0'
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

    await runBackfillSummaryLogRowStates(mockServer)

    expect(logger.warn).toHaveBeenCalledWith({
      message:
        'Waste-record-state backfill orphaned accreditation: organisationId=org-1 registrationId=reg-1 accreditationId=acc-1'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-record-state backfill complete: organisationsScanned=1 ledgersBackfilled=0 ledgersSkippedComplete=0 submissionsBackfilled=0 summaryLogRowStateWrites=0 orphanedAccreditations=1'
    })
  })

  /**
   * @param {number} registrationsProcessed
   */
  const progressAt = (registrationsProcessed) => ({
    registrationsProcessed,
    organisationId: 'org-1',
    registrationId: `reg-${registrationsProcessed}`,
    ledgersBackfilled: 5,
    ledgersSkippedComplete: 2,
    submissionsBackfilled: 12,
    summaryLogRowStateWrites: 80,
    orphanedAccreditations: 1
  })

  it('logs a throttled progress line each time the interval boundary is crossed', async () => {
    vi.mocked(backfillEstateSummaryLogRowStates).mockImplementation(
      async ({ onProgress }) => {
        onProgress(progressAt(PROGRESS_LOG_INTERVAL - 1))
        onProgress(progressAt(PROGRESS_LOG_INTERVAL))
        onProgress(progressAt(PROGRESS_LOG_INTERVAL * 2))
        return {
          organisationsScanned: 0,
          ledgersBackfilled: 0,
          ledgersSkippedComplete: 0,
          submissionsBackfilled: 0,
          summaryLogRowStateWrites: 0,
          orphanedAccreditations: []
        }
      }
    )

    await runBackfillSummaryLogRowStates(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message: `Waste-record-state backfill progress: registrationsProcessed=${PROGRESS_LOG_INTERVAL} organisationId=org-1 registrationId=reg-${PROGRESS_LOG_INTERVAL} ledgersBackfilled=5 ledgersSkippedComplete=2 submissionsBackfilled=12 summaryLogRowStateWrites=80 orphanedAccreditations=1`
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: `Waste-record-state backfill progress: registrationsProcessed=${PROGRESS_LOG_INTERVAL * 2} organisationId=org-1 registrationId=reg-${PROGRESS_LOG_INTERVAL * 2} ledgersBackfilled=5 ledgersSkippedComplete=2 submissionsBackfilled=12 summaryLogRowStateWrites=80 orphanedAccreditations=1`
    })
    expect(logger.info).not.toHaveBeenCalledWith({
      message: expect.stringContaining(
        `registrationsProcessed=${PROGRESS_LOG_INTERVAL - 1} `
      )
    })
  })

  it('releases the lock and logs an error when the backfill throws', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(backfillEstateSummaryLogRowStates).mockRejectedValue(error)

    await runBackfillSummaryLogRowStates(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run summary-log-row-state backfill'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    mockServer.locker.lock.mockRejectedValue(error)

    await runBackfillSummaryLogRowStates(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run summary-log-row-state backfill'
    })
  })
})
