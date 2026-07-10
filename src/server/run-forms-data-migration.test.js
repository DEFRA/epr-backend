import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runFormsDataMigration } from './run-forms-data-migration.js'
import { logger } from '#common/helpers/logging/logger.js'
import { createFormDataMigrator } from '#formsubmission/migration/migration-orchestrator.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { partialMock } from '#test/partial-mock.js'

/** @import {FormSubmissionsRepository} from '#repositories/form-submissions/port.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {SystemLogsRepository} from '#repositories/system-logs/port.js' */

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

vi.mock('#repositories/system-logs/mongodb.js', () => ({
  createSystemLogsRepository: vi.fn()
}))

describe('runFormsDataMigration', () => {
  let mockServer
  /** @type {FormSubmissionsRepository} */
  let mockFormSubmissionsRepository
  /** @type {OrganisationsRepository} */
  let mockOrganisationsRepository
  let mockLock
  let mockFormsDataMigration
  /** @type {SystemLogsRepository} */
  const mockSystemLogsRepository = partialMock({})

  beforeEach(() => {
    vi.clearAllMocks()

    mockFormSubmissionsRepository = partialMock({
      findAllOrganisations: vi.fn()
    })
    mockOrganisationsRepository = partialMock({ insert: vi.fn() })

    mockFormsDataMigration = {
      migrate: vi.fn().mockResolvedValue(undefined)
    }

    mockLock = {
      free: vi.fn().mockResolvedValue(undefined)
    }

    mockServer = {
      db: {},
      locker: {
        lock: vi.fn().mockResolvedValue(mockLock)
      }
    }

    vi.mocked(createFormSubmissionsRepository).mockResolvedValue(
      () => mockFormSubmissionsRepository
    )
    vi.mocked(createOrganisationsRepository).mockResolvedValue(
      () => mockOrganisationsRepository
    )
    vi.mocked(createSystemLogsRepository).mockResolvedValue(
      () => mockSystemLogsRepository
    )
    vi.mocked(createFormDataMigrator).mockReturnValue(mockFormsDataMigration)

    logger.info = vi.fn()
    logger.error = vi.fn()
  })

  it('should run migration', async () => {
    await runFormsDataMigration(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Starting form data migration'
    })
    expect(mockServer.locker.lock).toHaveBeenCalledWith('forms-data-migration')
    expect(mockFormsDataMigration.migrate).toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Form data migration completed successfully'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('should handle errors gracefully', async () => {
    const error = new Error('Migration failed')
    mockFormsDataMigration.migrate.mockRejectedValue(error)

    await runFormsDataMigration(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      message: 'Failed to run form data migration',
      err: error
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('should skip migration when unable to obtain lock', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runFormsDataMigration(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping running form data migration'
    })
    expect(createFormDataMigrator).not.toHaveBeenCalled()
  })
})
