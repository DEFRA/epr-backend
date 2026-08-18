import { describe, it, expect, vi, beforeEach } from 'vitest'
import { partialMock } from '#test/type-helpers.js'
import { logger } from '#common/helpers/logging/logger.js'
import { runReportDataCompletenessDiagnostic } from './run-report-data-completeness-diagnostic.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

/**
 * @param {object} [options]
 * @param {boolean} [options.enabled]
 * @param {any} [options.lock]
 * @param {Error} [options.lockError]
 */
const buildServer = ({ enabled = true, lock, lockError } = {}) =>
  partialMock({
    app: {},
    featureFlags: { isReportDataCompleteDiagnosticEnabled: () => enabled },
    locker: {
      lock: lockError
        ? vi.fn().mockRejectedValue(lockError)
        : vi.fn().mockResolvedValue(lock)
    }
  })

describe('runReportDataCompletenessDiagnostic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns without touching the locker when the flag is off', async () => {
    const server = buildServer({ enabled: false })

    await runReportDataCompletenessDiagnostic(server)

    expect(server.locker.lock).not.toHaveBeenCalled()
  })

  it('logs and skips when the lock cannot be obtained', async () => {
    const server = buildServer({ lock: null })

    await runReportDataCompletenessDiagnostic(server)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Unable to obtain lock, skipping report-data completeness diagnostic'
    })
  })

  it('logs the error when the run fails', async () => {
    const lockError = new Error('locker down')
    const server = buildServer({ lockError })

    await runReportDataCompletenessDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: lockError,
      message: 'Failed to run report-data completeness diagnostic'
    })
  })
})
