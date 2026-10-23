import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { config } from '../config.js'

import { backfillPrnNumbers } from './application/backfill.js'
import { runPrnNumbersBackfill } from './run.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#packaging-recycling-notes/repository/mongodb.js', () => ({
  createPackagingRecyclingNotesRepository: vi.fn(async () => () => ({}))
}))
vi.mock('#repositories/system-logs/mongodb.js', () => ({
  createSystemLogsRepository: vi.fn(async () => () => ({}))
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn(async () => () => ({}))
}))
vi.mock('./application/backfill.js', () => ({
  backfillPrnNumbers: vi.fn()
}))
vi.mock('../config.js', () => ({ config: { get: vi.fn() } }))

const prnIds = (/** @type {number} */ from, /** @type {number} */ to) =>
  Array.from({ length: to - from + 1 }, (_, i) => `prn-${from + i}`)

describe('runPrnNumbersBackfill', () => {
  /** @type {*} */
  let lock
  /** @type {*} */
  let server

  beforeEach(() => {
    vi.clearAllMocks()
    lock = { free: vi.fn() }
    server = { db: {}, locker: { lock: vi.fn().mockResolvedValue(lock) } }
    vi.mocked(backfillPrnNumbers).mockResolvedValue({
      missing: 15,
      mapped: 2,
      unmapped: 13,
      unmappedReasons: {
        'organisation not found': prnIds(1, 12),
        'no registration number': prnIds(13, 13)
      },
      failed: 0,
      auditFailed: 0
    })
  })

  it('runs as a dry run when the flag is off, and logs the counts with up to ten PRNs for each reason', async () => {
    vi.mocked(config.get).mockReturnValue(false)

    await runPrnNumbersBackfill(server)

    expect(config.get).toHaveBeenCalledWith('featureFlags.prnNumbersBackfill')
    expect(backfillPrnNumbers).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: true
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'PRN numbers backfill (dry-run): missing=15 mapped=2 unmapped=13 failed=0 auditFailed=0 unmappedReasons="organisation not found: 12 (prn-1, prn-2, prn-3, prn-4, prn-5, prn-6, prn-7, prn-8, prn-9, prn-10); no registration number: 1 (prn-13)"'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('writes when the flag is on', async () => {
    vi.mocked(config.get).mockReturnValue(true)

    await runPrnNumbersBackfill(server)

    expect(backfillPrnNumbers).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: false
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringContaining('(backfill)')
    })
  })

  it('skips when the lock is not obtained', async () => {
    server.locker.lock.mockResolvedValue(null)

    await runPrnNumbersBackfill(server)

    expect(backfillPrnNumbers).not.toHaveBeenCalled()
  })

  it('logs and frees the lock when the backfill throws', async () => {
    const error = new Error('boom')
    vi.mocked(backfillPrnNumbers).mockRejectedValue(error)

    await runPrnNumbersBackfill(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run PRN numbers backfill'
    })
    expect(lock.free).toHaveBeenCalled()
  })
})
