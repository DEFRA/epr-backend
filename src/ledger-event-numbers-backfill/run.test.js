import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { config } from '../config.js'

import { backfillLedgerEventNumbers } from './application/backfill.js'
import { runLedgerEventNumbersBackfill } from './run.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#waste-balances/repository/ledger-mongodb.js', () => ({
  createMongoLedgerRepository: vi.fn(async () => () => ({}))
}))
vi.mock('#repositories/system-logs/mongodb.js', () => ({
  createSystemLogsRepository: vi.fn(async () => () => ({}))
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn(async () => () => ({}))
}))
vi.mock('./application/backfill.js', () => ({
  backfillLedgerEventNumbers: vi.fn()
}))
vi.mock('../config.js', () => ({ config: { get: vi.fn() } }))

describe('runLedgerEventNumbersBackfill', () => {
  /** @type {*} */
  let lock
  /** @type {*} */
  let server

  beforeEach(() => {
    vi.clearAllMocks()
    lock = { free: vi.fn() }
    server = { db: {}, locker: { lock: vi.fn().mockResolvedValue(lock) } }
    vi.mocked(backfillLedgerEventNumbers).mockResolvedValue({
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

    await runLedgerEventNumbersBackfill(server)

    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.ledgerEventNumbersBackfill'
    )
    expect(backfillLedgerEventNumbers).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: true
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Ledger event numbers backfill (dry-run): missing=40 mapped=25 unmapped=15 failedLedgers=0 auditFailedLedgers=0 unmappedReasons="organisation not found: 1 (org-9/reg-1/null (12)); no accreditation number: 1 (org-1/reg-2/acc-2 (3))"'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('writes when the flag is on', async () => {
    vi.mocked(config.get).mockReturnValue(true)

    await runLedgerEventNumbersBackfill(server)

    expect(backfillLedgerEventNumbers).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: false
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringContaining('(backfill)')
    })
  })

  it('skips when the lock is not obtained', async () => {
    server.locker.lock.mockResolvedValue(null)

    await runLedgerEventNumbersBackfill(server)

    expect(backfillLedgerEventNumbers).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping ledger event numbers backfill'
    })
  })

  it('logs and frees the lock when the backfill throws', async () => {
    const error = new Error('boom')
    vi.mocked(backfillLedgerEventNumbers).mockRejectedValue(error)

    await runLedgerEventNumbersBackfill(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run ledger event numbers backfill'
    })
    expect(lock.free).toHaveBeenCalled()
  })
})
