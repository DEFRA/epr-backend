import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runRegistrationContactsMigration } from './run-registration-contacts-migration.js'
import { logger } from '#common/helpers/logging/logger.js'
import { RegistrationContactsMigrationOrchestrator } from '#formsubmission/registration-contacts-migration/registration-contacts-migration-orchestrator.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock(
  '#formsubmission/registration-contacts-migration/registration-contacts-migration-orchestrator.js',
  () => ({
    RegistrationContactsMigrationOrchestrator: vi.fn()
  })
)

vi.mock('#repositories/form-submissions/mongodb.js', () => ({
  createFormSubmissionsRepository: vi.fn()
}))

vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))

vi.mock('#repositories/system-logs/mongodb.js', () => ({
  createSystemLogsRepository: vi.fn()
}))

describe('runRegistrationContactsMigration', () => {
  let mockServer
  let mockLock
  let mockMigrate

  beforeEach(() => {
    vi.clearAllMocks()

    mockMigrate = vi.fn().mockResolvedValue(undefined)

    RegistrationContactsMigrationOrchestrator.mockImplementation(function () {
      this.migrate = mockMigrate
    })

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }

    mockServer = {
      db: {},
      locker: { lock: vi.fn().mockResolvedValue(mockLock) },
      featureFlags: {
        isRegistrationContactsMigrationEnabled: vi.fn().mockReturnValue(true)
      }
    }

    createFormSubmissionsRepository.mockReturnValue(() => ({}))
    createOrganisationsRepository.mockReturnValue(() => ({}))
    createSystemLogsRepository.mockResolvedValue(() => ({}))

    logger.info = vi.fn()
    logger.error = vi.fn()
  })

  it('acquires lock and calls migrate(true) when feature flag is enabled', async () => {
    await runRegistrationContactsMigration(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'fix-registration-contacts'
    )
    expect(RegistrationContactsMigrationOrchestrator).toHaveBeenCalled()
    expect(mockMigrate).toHaveBeenCalledWith(true)
    expect(mockLock.free).toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Registration contacts migration completed successfully'
    })
  })

  it('acquires lock and calls migrate(false) for dry run when feature flag is disabled', async () => {
    mockServer.featureFlags.isRegistrationContactsMigrationEnabled.mockReturnValue(
      false
    )

    await runRegistrationContactsMigration(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'fix-registration-contacts'
    )
    expect(RegistrationContactsMigrationOrchestrator).toHaveBeenCalled()
    expect(mockMigrate).toHaveBeenCalledWith(false)
  })

  it('skips migration when lock is unavailable', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runRegistrationContactsMigration(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping registration contacts migration'
    })
    expect(RegistrationContactsMigrationOrchestrator).not.toHaveBeenCalled()
  })

  it('releases lock and logs error when migration throws', async () => {
    const error = new Error('migration failed')
    mockMigrate.mockRejectedValue(error)

    await runRegistrationContactsMigration(mockServer)

    expect(mockLock.free).toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      error,
      'Failed to run registration contacts migration'
    )
  })
})
