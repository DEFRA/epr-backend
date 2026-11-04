import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { config } from '../config.js'

import { backfillReportNumbers } from './application/backfill.js'
import { runReportNumbersBackfill } from './run.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#reports/repository/mongodb.js', () => ({
  createReportsRepository: vi.fn(async () => () => ({}))
}))
vi.mock('#repositories/system-logs/mongodb.js', () => ({
  createSystemLogsRepository: vi.fn(async () => () => ({}))
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn(async () => () => ({}))
}))
vi.mock('#overseas-sites/repository/mongodb.js', () => ({
  createOverseasSitesRepository: vi.fn(async () => () => ({}))
}))
vi.mock('#organisation-read-model/repository/adapter.js', () => ({
  createOrganisationReadRepository: vi.fn(() => ({}))
}))
vi.mock('./application/backfill.js', () => ({
  backfillReportNumbers: vi.fn()
}))
vi.mock('../config.js', () => ({ config: { get: vi.fn() } }))

const reportIds = (/** @type {number} */ from, /** @type {number} */ to) =>
  Array.from({ length: to - from + 1 }, (_, i) => `report-${from + i}`)

describe('runReportNumbersBackfill', () => {
  /** @type {*} */
  let lock
  /** @type {*} */
  let server

  beforeEach(() => {
    vi.clearAllMocks()
    lock = { free: vi.fn() }
    server = { db: {}, locker: { lock: vi.fn().mockResolvedValue(lock) } }
    vi.mocked(backfillReportNumbers).mockResolvedValue({
      missing: 15,
      mapped: 2,
      unmapped: 13,
      unmappedReasons: {
        'organisation not found': reportIds(1, 12),
        'no accreditation for the report year': reportIds(13, 13)
      },
      failed: 0,
      auditFailed: 0,
      registrationsWithSeveralAccreditations: [
        {
          organisationNumber: 500123,
          registrationId: 'reg-1',
          accreditations: [
            {
              id: 'acc-1',
              accreditationNumber: 'A26ER5001180114PL',
              status: 'approved',
              validFrom: '2026-07-01'
            },
            {
              id: 'acc-2',
              accreditationNumber: null,
              status: 'cancelled',
              validFrom: '2026-01-01'
            }
          ]
        }
      ]
    })
  })

  it('runs as a dry run when the flag is off, and logs the counts with every report for each reason and each registration with several accreditations', async () => {
    vi.mocked(config.get).mockReturnValue(false)

    await runReportNumbersBackfill(server)

    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.reportNumbersBackfill'
    )
    expect(backfillReportNumbers).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: true
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: `Report numbers backfill (dry-run): missing=15 mapped=2 unmapped=13 failed=0 auditFailed=0 unmappedReasons="organisation not found: 12 (${reportIds(1, 12).join(', ')}); no accreditation for the report year: 1 (report-13)" severalAccreditations=1 registrations="500123 reg-1: acc-1 (A26ER5001180114PL) approved from 2026-07-01, acc-2 (null) cancelled from 2026-01-01"`
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('writes when the flag is on', async () => {
    vi.mocked(config.get).mockReturnValue(true)

    await runReportNumbersBackfill(server)

    expect(backfillReportNumbers).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: false
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringContaining('(backfill)')
    })
  })

  it('skips when the lock is not obtained', async () => {
    server.locker.lock.mockResolvedValue(null)

    await runReportNumbersBackfill(server)

    expect(backfillReportNumbers).not.toHaveBeenCalled()
  })

  it('logs and frees the lock when the backfill throws', async () => {
    const error = new Error('boom')
    vi.mocked(backfillReportNumbers).mockRejectedValue(error)

    await runReportNumbersBackfill(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run report numbers backfill'
    })
    expect(lock.free).toHaveBeenCalled()
  })
})
