import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { config } from '../config.js'

import { backfillRowStateNumbers } from './application/backfill.js'
import { runRowStateNumbersBackfill } from './run.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#waste-records/repository/mongodb.js', () => ({
  createMongoSummaryLogRowStatesRepository: vi.fn(async () => () => ({}))
}))
vi.mock('#repositories/system-logs/mongodb.js', () => ({
  createSystemLogsRepository: vi.fn(async () => () => ({}))
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn(async () => () => ({}))
}))
vi.mock('./application/backfill.js', () => ({
  backfillRowStateNumbers: vi.fn()
}))
vi.mock('../config.js', () => ({ config: { get: vi.fn() } }))

describe('runRowStateNumbersBackfill', () => {
  /** @type {*} */
  let lock
  /** @type {*} */
  let server

  beforeEach(() => {
    vi.clearAllMocks()
    lock = { free: vi.fn() }
    server = { db: {}, locker: { lock: vi.fn().mockResolvedValue(lock) } }
    vi.mocked(backfillRowStateNumbers).mockResolvedValue({
      missing: 40,
      mapped: 25,
      unmapped: 15,
      unmappedReasons: {
        'organisation not found': ['org-9/reg-1/null (12)'],
        'no accreditation number': ['org-1/reg-2/acc-2 (3)']
      },
      failed: 0,
      auditFailed: 0
    })
  })

  it('runs as a dry run when the flag is off, and logs the counts with every ledger for each reason', async () => {
    vi.mocked(config.get).mockReturnValue(false)

    await runRowStateNumbersBackfill(server)

    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.rowStateNumbersBackfill'
    )
    expect(backfillRowStateNumbers).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: true
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Row state numbers backfill (dry-run): missing=40 mapped=25 unmapped=15 failedLedgers=0 auditFailedLedgers=0 unmappedReasons="organisation not found: 1 (org-9/reg-1/null (12)); no accreditation number: 1 (org-1/reg-2/acc-2 (3))"'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('writes when the flag is on', async () => {
    vi.mocked(config.get).mockReturnValue(true)

    await runRowStateNumbersBackfill(server)

    expect(backfillRowStateNumbers).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: false
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringContaining('(backfill)')
    })
  })

  it('skips when the lock is not obtained', async () => {
    server.locker.lock.mockResolvedValue(null)

    await runRowStateNumbersBackfill(server)

    expect(backfillRowStateNumbers).not.toHaveBeenCalled()
  })

  it('logs and frees the lock when the backfill throws', async () => {
    const error = new Error('boom')
    vi.mocked(backfillRowStateNumbers).mockRejectedValue(error)

    await runRowStateNumbersBackfill(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run row state numbers backfill'
    })
    expect(lock.free).toHaveBeenCalled()
  })
})
