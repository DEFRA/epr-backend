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

const IDENTITY =
  'organisationId=org-1 registrationId=reg-1 reportId=report-1 submissionNumber=1 year=2025 cadence=monthly period=1 flaggedAt=2026-05-01T00:00:00.000Z flaggedBy=sl-2'

/** @returns {*} */
const outcome = (verdict) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  reportId: 'report-1',
  submissionNumber: 1,
  period: { year: 2025, cadence: 'monthly', period: 1 },
  flaggedAt: '2026-05-01T00:00:00.000Z',
  flaggedBy: 'sl-2',
  ...verdict
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

  describe('one line per flagged report', () => {
    it.each([
      {
        verdict: { verdict: 'would-clear' },
        line: `Resubmission flag would-clear: ${IDENTITY} reason=none changedFields=none detail=none`
      },
      {
        verdict: { verdict: 'kept', reason: 'operator-requested' },
        line: `Resubmission flag kept: ${IDENTITY} reason=operator-requested changedFields=none detail=none`
      },
      {
        verdict: {
          verdict: 'kept',
          reason: 'figures-changed',
          changedFields: [
            'recyclingActivity.totalTonnageReceived',
            'recyclingActivity.suppliers'
          ]
        },
        line: `Resubmission flag kept: ${IDENTITY} reason=figures-changed changedFields=recyclingActivity.totalTonnageReceived,recyclingActivity.suppliers detail=none`
      },
      {
        verdict: {
          verdict: 'kept',
          reason: 'cannot-compare',
          detail: 'its report records no source'
        },
        line: `Resubmission flag kept: ${IDENTITY} reason=cannot-compare changedFields=none detail=its report records no source`
      }
    ])('logs $verdict.verdict $verdict.reason', async ({ verdict, line }) => {
      vi.mocked(reevaluateResubmissionFlags).mockResolvedValue({
        outcomes: [outcome(verdict)],
        failures: []
      })

      await runResubmissionFlagsDryRun(mockServer)

      expect(logger.info).toHaveBeenCalledWith({ message: line })
    })
  })

  it('logs each report it failed to evaluate', async () => {
    vi.mocked(reevaluateResubmissionFlags).mockResolvedValue({
      outcomes: [],
      failures: [{ reportId: 'report-4', error: 'connection reset' }]
    })

    await runResubmissionFlagsDryRun(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      message:
        'Failed to re-evaluate resubmission flag on report report-4: connection reset'
    })
  })

  it('logs a summary counting would-clear, kept by reason, and failures', async () => {
    vi.mocked(reevaluateResubmissionFlags).mockResolvedValue({
      outcomes: [
        outcome({ verdict: 'would-clear' }),
        outcome({ verdict: 'would-clear' }),
        outcome({ verdict: 'kept', reason: 'operator-requested' }),
        outcome({ verdict: 'kept', reason: 'resubmission-in-progress' }),
        outcome({
          verdict: 'kept',
          reason: 'figures-changed',
          changedFields: ['recyclingActivity.totalTonnageReceived']
        }),
        outcome({
          verdict: 'kept',
          reason: 'cannot-compare',
          detail: 'its report records no source'
        }),
        outcome({
          verdict: 'kept',
          reason: 'cannot-compare',
          detail: 'the summary log that set the flag no longer exists'
        })
      ],
      failures: [{ reportId: 'report-4', error: 'connection reset' }]
    })

    await runResubmissionFlagsDryRun(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Resubmission flags dry run: flagged=8 wouldClear=2 keptOperatorRequested=1 keptResubmissionInProgress=1 keptFiguresChanged=1 keptCannotCompare=2 failed=1'
    })
  })

  it('runs under the lock and frees it', async () => {
    await runResubmissionFlagsDryRun(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'resubmission-flags-dry-run'
    )
    expect(reevaluateResubmissionFlags).toHaveBeenCalled()
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('skips the run when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runResubmissionFlagsDryRun(mockServer)

    expect(reevaluateResubmissionFlags).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping resubmission flags dry run'
    })
  })

  it('logs a failed run without throwing, and frees the lock', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(reevaluateResubmissionFlags).mockRejectedValue(error)

    await expect(runResubmissionFlagsDryRun(mockServer)).resolves.toBe(
      undefined
    )

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run resubmission flags dry run'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })
})
