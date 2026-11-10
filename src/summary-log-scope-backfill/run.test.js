import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { config } from '../config.js'

import { backfillSummaryLogScope } from './application/backfill.js'
import { runSummaryLogScopeBackfill } from './run.js'

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
  backfillSummaryLogScope: vi.fn()
}))
vi.mock('../config.js', () => ({ config: { get: vi.fn() } }))

describe('runSummaryLogScopeBackfill', () => {
  /** @type {*} */
  let lock
  /** @type {*} */
  let server

  beforeEach(() => {
    vi.clearAllMocks()
    lock = { free: vi.fn() }
    server = { db: {}, locker: { lock: vi.fn().mockResolvedValue(lock) } }
    vi.mocked(backfillSummaryLogScope).mockResolvedValue({
      missing: 3,
      inFlight: 1,
      mapped: 2,
      unmapped: 1,
      yearSet: 2,
      linkDiffers: 0,
      failed: 0,
      auditFailed: 0
    })
  })

  it('runs as a dry run when the flag is off, and logs the counts', async () => {
    vi.mocked(config.get).mockReturnValue(false)

    await runSummaryLogScopeBackfill(server)

    expect(backfillSummaryLogScope).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: true
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Summary log scope backfill (dry-run): missing=3 inFlight=1 mapped=2 unmapped=1 yearSet=2 linkDiffers=0 failed=0 auditFailed=0'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('writes when the flag is on', async () => {
    vi.mocked(config.get).mockReturnValue(true)

    await runSummaryLogScopeBackfill(server)

    expect(backfillSummaryLogScope).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: false
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringContaining('(backfill)')
    })
  })

  it('skips when the lock is not obtained', async () => {
    server.locker.lock.mockResolvedValue(null)

    await runSummaryLogScopeBackfill(server)

    expect(backfillSummaryLogScope).not.toHaveBeenCalled()
  })

  it('logs and frees the lock when the backfill throws', async () => {
    const error = new Error('boom')
    vi.mocked(backfillSummaryLogScope).mockRejectedValue(error)

    await runSummaryLogScopeBackfill(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run summary log scope backfill'
    })
    expect(lock.free).toHaveBeenCalled()
  })
})
