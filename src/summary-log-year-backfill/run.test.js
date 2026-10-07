import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { config } from '../config.js'

import { backfillSummaryLogYear } from './application/backfill.js'
import { runSummaryLogYearBackfill } from './run.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#common/helpers/s3/s3-client.js', () => ({
  createS3Client: vi.fn()
}))
vi.mock('#repositories/summary-logs/mongodb.js', () => ({
  createSummaryLogsRepository: vi.fn(async () => () => ({}))
}))
vi.mock('#repositories/system-logs/mongodb.js', () => ({
  createSystemLogsRepository: vi.fn(async () => () => ({}))
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn(async () => () => ({}))
}))
vi.mock('./application/backfill.js', () => ({
  backfillSummaryLogYear: vi.fn()
}))
vi.mock('../config.js', () => ({ config: { get: vi.fn() } }))

describe('runSummaryLogYearBackfill', () => {
  /** @type {*} */
  let lock
  /** @type {*} */
  let server

  beforeEach(() => {
    vi.clearAllMocks()
    lock = { free: vi.fn() }
    server = { db: {}, locker: { lock: vi.fn().mockResolvedValue(lock) } }
    vi.mocked(backfillSummaryLogYear).mockResolvedValue({
      legacy: 2,
      updated: 0,
      failed: 0,
      auditFailed: 0,
      years: { 2025: 2 }
    })
  })

  it('runs as a dry run when the flag is off', async () => {
    vi.mocked(config.get).mockReturnValue(false)

    await runSummaryLogYearBackfill(server)

    expect(backfillSummaryLogYear).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: true
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringContaining('(dry-run)')
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('writes when the flag is on', async () => {
    vi.mocked(config.get).mockReturnValue(true)

    await runSummaryLogYearBackfill(server)

    expect(backfillSummaryLogYear).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: false
    })
  })

  it('skips when the lock is not obtained', async () => {
    server.locker.lock.mockResolvedValue(null)

    await runSummaryLogYearBackfill(server)

    expect(backfillSummaryLogYear).not.toHaveBeenCalled()
  })

  it('logs and frees the lock when the backfill throws', async () => {
    vi.mocked(config.get).mockReturnValue(true)
    vi.mocked(backfillSummaryLogYear).mockRejectedValue(new Error('boom'))

    await runSummaryLogYearBackfill(server)

    expect(logger.error).toHaveBeenCalled()
    expect(lock.free).toHaveBeenCalled()
  })
})
