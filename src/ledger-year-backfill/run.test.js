import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { toYear } from '#common/helpers/dates/year.js'
import { config } from '../config.js'

import { backfillLedgerYear } from './application/backfill.js'
import { runLedgerYearBackfill } from './run.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('./mongodb.js', () => ({
  createYearlessLedgers: vi.fn(() => ({}))
}))
vi.mock('#repositories/system-logs/mongodb.js', () => ({
  createSystemLogsRepository: vi.fn(async () => () => ({}))
}))
vi.mock('./application/backfill.js', () => ({
  backfillLedgerYear: vi.fn()
}))
vi.mock('../config.js', () => ({ config: { get: vi.fn() } }))

describe('runLedgerYearBackfill', () => {
  /** @type {*} */
  let lock
  /** @type {*} */
  let server

  beforeEach(() => {
    vi.clearAllMocks()
    lock = { free: vi.fn() }
    server = { db: {}, locker: { lock: vi.fn().mockResolvedValue(lock) } }
    vi.mocked(backfillLedgerYear).mockResolvedValue({
      ledgers: 2,
      years: new Map([
        [toYear(2027), { events: 1, rowStates: 0 }],
        [toYear(2026), { events: 4, rowStates: 3 }]
      ]),
      skipped: { events: 0, rowStates: 1 },
      failed: 0,
      auditFailed: 0
    })
  })

  it('runs as a dry run when the flag is off, and logs the counts', async () => {
    vi.mocked(config.get).mockReturnValue(false)

    await runLedgerYearBackfill(server)

    expect(config.get).toHaveBeenCalledWith('featureFlags.ledgerYearBackfill')
    expect(backfillLedgerYear).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: true
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Ledger year backfill (dry-run): ledgers=2 failed=0 auditFailed=0; 2026: events=4 rowStates=3; 2027: events=1 rowStates=0; skipped: events=0 rowStates=1'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('writes when the flag is on', async () => {
    vi.mocked(config.get).mockReturnValue(true)

    await runLedgerYearBackfill(server)

    expect(backfillLedgerYear).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: false
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringContaining('(backfill)')
    })
  })

  it('skips when the lock is not obtained', async () => {
    server.locker.lock.mockResolvedValue(null)

    await runLedgerYearBackfill(server)

    expect(backfillLedgerYear).not.toHaveBeenCalled()
  })

  it('logs and frees the lock when the backfill throws', async () => {
    const error = new Error('boom')
    vi.mocked(backfillLedgerYear).mockRejectedValue(error)

    await runLedgerYearBackfill(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run ledger year backfill'
    })
    expect(lock.free).toHaveBeenCalled()
  })
})
