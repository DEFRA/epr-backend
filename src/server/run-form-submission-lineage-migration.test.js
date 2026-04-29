import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runFormSubmissionLineageMigration } from './run-form-submission-lineage-migration.js'

import { logger } from '#common/helpers/logging/logger.js'
import { migrateFormSubmissionLineage } from '#formsubmission/migration/migrate-form-submission-lineage.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock('#formsubmission/migration/migrate-form-submission-lineage.js', () => ({
  migrateFormSubmissionLineage: vi.fn()
}))
vi.mock('#repositories/form-submissions/mongodb.js', () => ({
  createFormSubmissionsRepository: vi.fn()
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))
vi.mock('#repositories/system-logs/mongodb.js', () => ({
  createSystemLogsRepository: vi.fn()
}))

describe('runFormSubmissionLineageMigration', () => {
  let mockServer
  let mockLock
  let mockFeatureFlags
  let mockFormSubmissionsRepository
  let mockOrganisationsRepository
  let mockSystemLogsRepository

  beforeEach(() => {
    vi.clearAllMocks()

    mockFormSubmissionsRepository = {}
    mockOrganisationsRepository = {}
    mockSystemLogsRepository = {}

    mockLock = {
      free: vi.fn().mockResolvedValue(undefined)
    }

    mockFeatureFlags = {
      isMigrateFormSubmissionLineageEnabled: vi.fn().mockReturnValue(true)
    }

    mockServer = {
      db: {},
      featureFlags: mockFeatureFlags,
      locker: {
        lock: vi.fn().mockResolvedValue(mockLock)
      }
    }

    createFormSubmissionsRepository.mockResolvedValue(
      () => mockFormSubmissionsRepository
    )
    createOrganisationsRepository.mockResolvedValue(
      () => mockOrganisationsRepository
    )
    createSystemLogsRepository.mockResolvedValue(() => mockSystemLogsRepository)
    migrateFormSubmissionLineage.mockResolvedValue(undefined)
  })

  it('runs the migration when the feature flag is enabled', async () => {
    await runFormSubmissionLineageMigration(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'migrate-form-submission-lineage'
    )
    expect(migrateFormSubmissionLineage).toHaveBeenCalledWith(
      mockFormSubmissionsRepository,
      mockOrganisationsRepository,
      mockSystemLogsRepository,
      true
    )
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Form submission lineage migration completed successfully'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('passes the flag as false to migrateFormSubmissionLineage when the feature flag is disabled', async () => {
    mockFeatureFlags.isMigrateFormSubmissionLineageEnabled.mockReturnValue(
      false
    )

    await runFormSubmissionLineageMigration(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'migrate-form-submission-lineage'
    )
    expect(migrateFormSubmissionLineage).toHaveBeenCalledWith(
      mockFormSubmissionsRepository,
      mockOrganisationsRepository,
      mockSystemLogsRepository,
      false
    )
  })

  it('skips the migration when the distributed lock cannot be obtained', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runFormSubmissionLineageMigration(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Unable to obtain lock, skipping form submission lineage migration'
    })
    expect(migrateFormSubmissionLineage).not.toHaveBeenCalled()
  })

  it('releases the lock after the migration succeeds', async () => {
    await runFormSubmissionLineageMigration(mockServer)

    expect(mockLock.free).toHaveBeenCalled()
  })

  it('releases the lock and logs an error when the migration fails', async () => {
    const error = new Error('migration failed')
    migrateFormSubmissionLineage.mockRejectedValue(error)

    await runFormSubmissionLineageMigration(mockServer)

    expect(mockLock.free).toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run form submission lineage migration'
    })
  })

  it('uses options.featureFlags when provided instead of server.featureFlags', async () => {
    const overrideFlags = {
      isMigrateFormSubmissionLineageEnabled: vi.fn().mockReturnValue(false)
    }

    await runFormSubmissionLineageMigration(mockServer, {
      featureFlags: overrideFlags
    })

    expect(
      overrideFlags.isMigrateFormSubmissionLineageEnabled
    ).toHaveBeenCalled()
    expect(
      mockFeatureFlags.isMigrateFormSubmissionLineageEnabled
    ).not.toHaveBeenCalled()
    expect(migrateFormSubmissionLineage).toHaveBeenCalledWith(
      mockFormSubmissionsRepository,
      mockOrganisationsRepository,
      mockSystemLogsRepository,
      false
    )
  })
})
