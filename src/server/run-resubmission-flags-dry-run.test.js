import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { reevaluateResubmissionFlags } from '#application/summary-logs/reevaluate-resubmission-flags.js'

import { runResubmissionFlagsDryRun } from './run-resubmission-flags-dry-run.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#application/summary-logs/reevaluate-resubmission-flags.js', () => ({
  reevaluateResubmissionFlags: vi.fn()
}))
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
vi.mock('#common/helpers/s3/s3-client.js', () => ({
  createS3Client: vi.fn()
}))

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
  verdict: 'would-clear',
  ...overrides
})

describe('runResubmissionFlagsDryRun', () => {
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

    vi.mocked(reevaluateResubmissionFlags).mockResolvedValue({
      outcomes: [],
      failures: []
    })
  })

  it('logs each flagged report and a summary', async () => {
    vi.mocked(reevaluateResubmissionFlags).mockResolvedValue({
      outcomes: [
        outcome({}),
        outcome({
          reportId: 'report-2',
          comparison: {
            baseline: { reportId: 'report-2', submissionNumber: 1 },
            changedFields: ['recyclingActivity.totalTonnageReceived']
          },
          verdict: 'kept'
        }),
        outcome({ reportId: 'report-5', verdict: 'resubmission-in-progress' })
      ],
      failures: []
    })

    await runResubmissionFlagsDryRun(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'resubmission-flags-dry-run'
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
        'Resubmission flags dry run: flagged=3 wouldClear=1 kept=1 resubmissionInProgress=1 failed=0'
    })
  })

  it('logs the reports it failed to re-evaluate', async () => {
    vi.mocked(reevaluateResubmissionFlags).mockResolvedValue({
      outcomes: [outcome({})],
      failures: [{ reportId: 'report-4', error: 'connection reset' }]
    })

    await runResubmissionFlagsDryRun(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      message:
        'Failed to re-evaluate resubmission flag on report report-4: connection reset'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Resubmission flags dry run: flagged=2 wouldClear=1 kept=0 resubmissionInProgress=0 failed=1'
    })
  })

  it('skips the run when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runResubmissionFlagsDryRun(mockServer)

    expect(reevaluateResubmissionFlags).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping resubmission flags dry run'
    })
  })

  it('releases the lock and logs an error when the sweep throws', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(reevaluateResubmissionFlags).mockRejectedValue(error)

    await runResubmissionFlagsDryRun(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run resubmission flags dry run'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })
})
