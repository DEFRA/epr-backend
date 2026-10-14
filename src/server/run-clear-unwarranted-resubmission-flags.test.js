import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { clearUnwarrantedResubmissionFlags } from '#application/summary-logs/clear-unwarranted-resubmission-flags.js'
import { config } from '../config.js'

import { runClearUnwarrantedResubmissionFlags } from './run-clear-unwarranted-resubmission-flags.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock(
  '#application/summary-logs/clear-unwarranted-resubmission-flags.js',
  () => ({ clearUnwarrantedResubmissionFlags: vi.fn() })
)
vi.mock('#reports/repository/mongodb.js', () => ({
  createReportsRepository: vi.fn().mockResolvedValue(() => ({}))
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn().mockResolvedValue(() => ({}))
}))
vi.mock('#repositories/summary-logs/mongodb.js', () => ({
  createSummaryLogsRepository: vi.fn().mockResolvedValue(() => ({}))
}))
vi.mock('#waste-balances/repository/ledger-mongodb.js', () => ({
  createMongoLedgerRepository: vi.fn().mockResolvedValue(() => ({}))
}))
vi.mock('#waste-records/repository/mongodb.js', () => ({
  createMongoSummaryLogRowStatesRepository: vi
    .fn()
    .mockResolvedValue(() => ({}))
}))
vi.mock('#overseas-sites/repository/mongodb.js', () => ({
  createOverseasSitesRepository: vi.fn().mockResolvedValue(() => ({}))
}))
vi.mock('#repositories/system-logs/mongodb.js', () => ({
  createSystemLogsRepository: vi.fn().mockResolvedValue(() => ({}))
}))
vi.mock('#common/helpers/s3/s3-client.js', () => ({
  createS3Client: vi.fn()
}))
vi.mock('../config.js', async (importOriginal) => {
  const { config: actual } = /** @type {typeof import('../config.js')} */ (
    await importOriginal()
  )
  return { config: { get: vi.fn((key) => actual.get(key)), actual } }
})

const FLAG = 'featureFlags.clearUnwarrantedResubmissionFlags'

/** @param {boolean} enabled */
const setFlag = (enabled) =>
  vi
    .mocked(config.get)
    .mockImplementation((key) =>
      key === FLAG ? enabled : /** @type {*} */ (config).actual.get(key)
    )

const JANUARY_2025 = { year: 2025, cadence: 'monthly', period: 1 }

const outcome = (overrides) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  reportId: 'report-1',
  submissionNumber: 1,
  period: JANUARY_2025,
  closedPeriodRestated: {
    uploadedAt: '2026-05-01T00:00:00.000Z',
    summaryLogId: 'sl-2'
  },
  headSummaryLogId: 'file-3',
  comparison: {
    baseline: {
      reportId: 'report-1',
      submissionNumber: 1,
      sourceSummaryLogId: 'file-1'
    },
    changedFields: []
  },
  action: 'would-clear',
  ...overrides
})

describe('runClearUnwarrantedResubmissionFlags', () => {
  /** @type {*} */
  let mockServer
  /** @type {*} */
  let mockLock

  beforeEach(() => {
    vi.clearAllMocks()

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }
    mockServer = {
      db: {},
      locker: { lock: vi.fn().mockResolvedValue(mockLock) }
    }

    setFlag(false)
    vi.mocked(clearUnwarrantedResubmissionFlags).mockResolvedValue({
      outcomes: [],
      failures: []
    })
  })

  it('runs as a dry run when the feature flag is off, logging each report and a summary', async () => {
    vi.mocked(clearUnwarrantedResubmissionFlags).mockResolvedValue({
      outcomes: [
        outcome({}),
        outcome({
          reportId: 'report-2',
          comparison: {
            baseline: { reportId: 'report-2', submissionNumber: 1 },
            changedFields: ['recyclingActivity.totalTonnageReceived']
          },
          action: 'kept'
        })
      ],
      failures: []
    })

    await runClearUnwarrantedResubmissionFlags(mockServer)

    expect(config.get).toHaveBeenCalledWith(FLAG)
    expect(clearUnwarrantedResubmissionFlags).toHaveBeenCalledWith(
      expect.anything(),
      { isDryRun: true }
    )
    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'clear-unwarranted-resubmission-flags'
    )
    expect(mockLock.free).toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Resubmission flag would-clear: organisationId=org-1 registrationId=reg-1 reportId=report-1 submissionNumber=1 year=2025 cadence=monthly period=1 flaggedAt=2026-05-01T00:00:00.000Z flaggedBy=sl-2 source=file-1 head=file-3 verdict=does not require resubmission: reported data unchanged'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringMatching(
        /^Resubmission flag kept: .*reportId=report-2 .*source=none head=file-3 verdict=requires resubmission: reported data changed in recyclingActivity\.totalTonnageReceived$/
      )
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Clear unwarranted resubmission flags (dry-run): flagged=2 cleared=0 wouldClear=1 kept=1 resubmissionInProgress=0 skipped=0 failed=0'
    })
  })

  it('clears when the feature flag is on, logging failures', async () => {
    setFlag(true)
    vi.mocked(clearUnwarrantedResubmissionFlags).mockResolvedValue({
      outcomes: [
        outcome({ action: 'cleared' }),
        outcome({ reportId: 'report-3', action: 'skipped' }),
        outcome({ reportId: 'report-5', action: 'resubmission-in-progress' })
      ],
      failures: [{ reportId: 'report-4', error: 'connection reset' }]
    })

    await runClearUnwarrantedResubmissionFlags(mockServer)

    expect(clearUnwarrantedResubmissionFlags).toHaveBeenCalledWith(
      expect.anything(),
      { isDryRun: false }
    )
    expect(logger.error).toHaveBeenCalledWith({
      message:
        'Failed to re-evaluate resubmission flag on report report-4: connection reset'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Clear unwarranted resubmission flags (repair): flagged=4 cleared=1 wouldClear=0 kept=0 resubmissionInProgress=1 skipped=1 failed=1'
    })
  })

  it('skips the run when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runClearUnwarrantedResubmissionFlags(mockServer)

    expect(clearUnwarrantedResubmissionFlags).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Unable to obtain lock, skipping clear unwarranted resubmission flags'
    })
  })

  it('releases the lock and logs an error when the sweep throws', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(clearUnwarrantedResubmissionFlags).mockRejectedValue(error)

    await runClearUnwarrantedResubmissionFlags(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run clear unwarranted resubmission flags'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })
})
