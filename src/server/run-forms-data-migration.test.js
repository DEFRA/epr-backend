import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runFormsDataMigration } from './run-forms-data-migration.js'
import { logger } from '#common/helpers/logging/logger.js'
import { createFormDataMigrator } from '#formsubmission/migration/migration-orchestrator.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock('#formsubmission/migration/migration-orchestrator.js', () => ({
  createFormDataMigrator: vi.fn()
}))
vi.mock('#repositories/form-submissions/mongodb.js', () => ({
  createFormSubmissionsRepository: vi.fn()
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))

describe('runFormsDataMigration', () => {
  let mockServer
  let mockFeatureFlags
  let mockFormSubmissionsRepository
  let mockOrganisationsRepository
  let mockLock
  let mockFormsDataMigration

  beforeEach(() => {
    vi.clearAllMocks()

    mockFormSubmissionsRepository = { findAllOrganisations: vi.fn() }
    mockOrganisationsRepository = { insert: vi.fn() }

    mockFormsDataMigration = {
      migrate: vi.fn().mockResolvedValue(undefined)
    }

    mockLock = {
      free: vi.fn().mockResolvedValue(undefined)
    }

    mockFeatureFlags = {
      isFormsDataMigrationEnabled: vi.fn()
    }

    mockServer = {
      db: {},
      featureFlags: mockFeatureFlags,
      locker: {
        lock: vi.fn().mockResolvedValue(mockLock)
      }
    }

    createFormSubmissionsRepository.mockReturnValue(
      () => mockFormSubmissionsRepository
    )
    createOrganisationsRepository.mockReturnValue(
      () => mockOrganisationsRepository
    )
    createFormDataMigrator.mockReturnValue(mockFormsDataMigration)

    logger.info = vi.fn()
    logger.error = vi.fn()
  })

  it('should run migration when feature flag is enabled', async () => {
    mockFeatureFlags.isFormsDataMigrationEnabled.mockReturnValue(true)

    await runFormsDataMigration(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Starting form data migration. Feature flag enabled: true'
    })
    expect(mockServer.locker.lock).toHaveBeenCalledWith('forms-data-migration')
    expect(mockFormsDataMigration.migrate).toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Form data migration completed successfully'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('should not run migration when feature flag is disabled', async () => {
    mockFeatureFlags.isFormsDataMigrationEnabled.mockReturnValue(false)

    await runFormsDataMigration(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Starting form data migration. Feature flag enabled: false'
    })
    expect(createFormDataMigrator).not.toHaveBeenCalled()
  })

  it('should use options.featureFlags when provided', async () => {
    const customFeatureFlags = {
      isFormsDataMigrationEnabled: vi.fn().mockReturnValue(false)
    }

    await runFormsDataMigration(mockServer, {
      featureFlags: customFeatureFlags
    })

    expect(createFormDataMigrator).not.toHaveBeenCalled()
  })

  it('should handle errors gracefully', async () => {
    mockFeatureFlags.isFormsDataMigrationEnabled.mockReturnValue(true)
    const error = new Error('Migration failed')
    mockFormsDataMigration.migrate.mockRejectedValue(error)

    await runFormsDataMigration(mockServer)

    expect(logger.error).toHaveBeenCalledWith(
      error,
      'Failed to run form data migration'
    )
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('should skip migration when unable to obtain lock', async () => {
    mockFeatureFlags.isFormsDataMigrationEnabled.mockReturnValue(true)
    mockServer.locker.lock.mockResolvedValue(null)

    await runFormsDataMigration(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping running form data migration'
    })
    expect(createFormDataMigrator).not.toHaveBeenCalled()
  })
})
