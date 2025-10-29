import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runFormsDataMigration } from './run-forms-data-migration.js'
import { logger } from '#common/helpers/logging/logger.js'
import { migrateFormsData } from '../forms-submission-data/migrate-forms-data.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'

vi.mock('#common/helpers/logging/logger.js')
vi.mock('../forms-submission-data/migrate-forms-data.js')
vi.mock('#repositories/form-submissions/mongodb.js')
vi.mock('#repositories/organisations/mongodb.js')

describe('runFormsDataMigration', () => {
  let mockServer
  let mockFeatureFlags
  let mockFormSubmissionsRepository
  let mockOrganisationsRepository

  beforeEach(() => {
    vi.clearAllMocks()

    mockFormSubmissionsRepository = { findAll: vi.fn() }
    mockOrganisationsRepository = { insert: vi.fn() }

    mockFeatureFlags = {
      isFormsDataMigrationEnabled: vi.fn()
    }

    mockServer = {
      db: {},
      featureFlags: mockFeatureFlags
    }

    createFormSubmissionsRepository.mockReturnValue(
      () => mockFormSubmissionsRepository
    )
    createOrganisationsRepository.mockReturnValue(
      () => mockOrganisationsRepository
    )

    logger.info = vi.fn()
    logger.error = vi.fn()
  })

  it('should run migration when feature flag is enabled', async () => {
    mockFeatureFlags.isFormsDataMigrationEnabled.mockReturnValue(true)
    const mockStats = { totalSubmissions: 5, insertedCount: 5 }
    migrateFormsData.mockResolvedValue(mockStats)

    await runFormsDataMigration(mockServer)

    expect(logger.info).toHaveBeenCalledWith(
      'Starting form data migration. Feature flag enabled: true'
    )
    expect(createFormSubmissionsRepository).toHaveBeenCalledWith(mockServer.db)
    expect(createOrganisationsRepository).toHaveBeenCalledWith(mockServer.db)
    expect(migrateFormsData).toHaveBeenCalledWith(
      mockFormSubmissionsRepository,
      mockOrganisationsRepository
    )
    expect(logger.info).toHaveBeenCalledWith(
      'Form data migration completed successfully',
      mockStats
    )
  })

  it('should not run migration when feature flag is disabled', async () => {
    mockFeatureFlags.isFormsDataMigrationEnabled.mockReturnValue(false)

    await runFormsDataMigration(mockServer)

    expect(logger.info).toHaveBeenCalledWith(
      'Starting form data migration. Feature flag enabled: false'
    )
    expect(migrateFormsData).not.toHaveBeenCalled()
  })

  it('should use options.featureFlags when provided', async () => {
    const customFeatureFlags = {
      isFormsDataMigrationEnabled: vi.fn().mockReturnValue(true)
    }
    migrateFormsData.mockResolvedValue({ totalSubmissions: 0 })

    await runFormsDataMigration(mockServer, {
      featureFlags: customFeatureFlags
    })

    expect(customFeatureFlags.isFormsDataMigrationEnabled).toHaveBeenCalled()
    expect(mockFeatureFlags.isFormsDataMigrationEnabled).not.toHaveBeenCalled()
  })

  it('should handle errors gracefully', async () => {
    mockFeatureFlags.isFormsDataMigrationEnabled.mockReturnValue(true)
    const error = new Error('Migration failed')
    migrateFormsData.mockRejectedValue(error)

    await runFormsDataMigration(mockServer)

    expect(logger.error).toHaveBeenCalledWith(
      error,
      'Failed to run form data migration'
    )
  })

  it('should handle feature flag check errors', async () => {
    const error = new Error('Feature flag check failed')
    mockFeatureFlags.isFormsDataMigrationEnabled.mockImplementation(() => {
      throw error
    })

    await runFormsDataMigration(mockServer)

    expect(logger.error).toHaveBeenCalledWith(
      error,
      'Failed to run form data migration'
    )
  })
})
