import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { reevaluateResubmissionFlags } from '#application/summary-logs/reevaluate-resubmission-flags.js'
import { config } from '#root/config.js'

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
vi.mock('#repositories/system-logs/mongodb.js', () => ({
  createSystemLogsRepository: vi.fn().mockResolvedValue(() => ({}))
}))
vi.mock('#common/helpers/s3/s3-client.js', () => ({
  createS3Client: vi.fn()
}))
vi.mock('#root/config.js', () => ({ config: { get: vi.fn() } }))

/** @param {boolean} enabled */
const withClearingFlag = (enabled) =>
  vi
    .mocked(config.get)
    .mockImplementation(
      (/** @type {string} */ key) =>
        key === 'featureFlags.clearUnwarrantedResubmissionFlags' && enabled
    )

const REPORT =
  'reportId=report-1 submissionNumber=1 year=2025 cadence=monthly period=1 flaggedAt=2026-05-01T00:00:00.000Z flaggedBy=sl-2'
const IDENTITY = `organisationId=org-1 registrationNumber=R25SR500030912PA accreditationNumber=A26RE000001PA ${REPORT}`

/** @returns {*} */
const outcome = (verdict) => ({
  organisationId: 'org-1',
  registrationNumber: 'R25SR500030912PA',
  accreditationNumber: 'A26RE000001PA',
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
    withClearingFlag(false)
  })

  describe('one line per flagged report', () => {
    it.each([
      {
        name: 'would-clear',
        verdict: { verdict: 'would-clear' },
        line: `Resubmission flag would-clear: ${IDENTITY} reason=none changedFields=none detail=none`
      },
      {
        name: 'kept, operator-requested',
        verdict: { verdict: 'kept', reason: 'operator-requested' },
        line: `Resubmission flag kept: ${IDENTITY} reason=operator-requested changedFields=none detail=none`
      },
      {
        name: 'kept, figures-changed, with the field paths',
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
        name: 'kept, cannot-compare, with the detail quoted',
        verdict: {
          verdict: 'kept',
          reason: 'cannot-compare',
          detail: 'its report records no source'
        },
        line: `Resubmission flag kept: ${IDENTITY} reason=cannot-compare changedFields=none detail="its report records no source"`
      },
      {
        name: 'cleared',
        verdict: { verdict: 'cleared' },
        line: `Resubmission flag cleared: ${IDENTITY} reason=none changedFields=none detail=none`
      },
      {
        name: 'skipped, with the reason',
        verdict: { verdict: 'skipped', reason: 'resubmission-started' },
        line: `Resubmission flag skipped: ${IDENTITY} reason=resubmission-started changedFields=none detail=none`
      }
    ])('logs $name', async ({ verdict, line }) => {
      vi.mocked(reevaluateResubmissionFlags).mockResolvedValue({
        outcomes: [outcome(verdict)],
        failures: []
      })

      await runResubmissionFlagsDryRun(mockServer)

      expect(logger.info).toHaveBeenCalledWith({ message: line })
    })
  })

  it('logs a registration with no accreditation as none', async () => {
    vi.mocked(reevaluateResubmissionFlags).mockResolvedValue({
      outcomes: [
        outcome({ verdict: 'would-clear', accreditationNumber: null })
      ],
      failures: []
    })

    await runResubmissionFlagsDryRun(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message: `Resubmission flag would-clear: organisationId=org-1 registrationNumber=R25SR500030912PA accreditationNumber=none ${REPORT} reason=none changedFields=none detail=none`
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
        'Resubmission flags dry run: flagged=8 wouldClear=2 cleared=0 skipped=0 keptOperatorRequested=1 keptResubmissionInProgress=1 keptFiguresChanged=1 keptCannotCompare=2 failed=1'
    })
  })

  it('runs as a dry run while the clearing flag is off', async () => {
    await runResubmissionFlagsDryRun(mockServer)

    expect(reevaluateResubmissionFlags).toHaveBeenCalledWith(
      expect.anything(),
      { clearFlags: false }
    )
  })

  it('passes clearFlags through and logs a repair summary counting cleared and skipped while the clearing flag is on', async () => {
    withClearingFlag(true)
    vi.mocked(reevaluateResubmissionFlags).mockResolvedValue({
      outcomes: [
        outcome({ verdict: 'cleared' }),
        outcome({ verdict: 'cleared' }),
        outcome({ verdict: 'skipped', reason: 'changed-since-compared' }),
        outcome({ verdict: 'kept', reason: 'operator-requested' })
      ],
      failures: []
    })

    await runResubmissionFlagsDryRun(mockServer)

    expect(reevaluateResubmissionFlags).toHaveBeenCalledWith(
      expect.anything(),
      { clearFlags: true }
    )
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Resubmission flags repair: flagged=4 wouldClear=0 cleared=2 skipped=1 keptOperatorRequested=1 keptResubmissionInProgress=0 keptFiguresChanged=0 keptCannotCompare=0 failed=0'
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

  it('names the repair when skipping for the lock while the clearing flag is on', async () => {
    withClearingFlag(true)
    mockServer.locker.lock.mockResolvedValue(null)

    await runResubmissionFlagsDryRun(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping resubmission flags repair'
    })
  })

  it('names the repair when the run fails while the clearing flag is on', async () => {
    withClearingFlag(true)
    const error = new Error('mongo unavailable')
    vi.mocked(reevaluateResubmissionFlags).mockRejectedValue(error)

    await runResubmissionFlagsDryRun(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run resubmission flags repair'
    })
  })
})
