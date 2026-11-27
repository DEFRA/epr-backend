import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runFormsDataMigration } from './run-forms-data-migration.js'
import { logger } from '#common/helpers/logging/logger.js'
import { createFormDataMigrator } from '#formsubmission/migration/migration-orchestrator.js'
import { partialMock } from '#test/type-helpers.js'

/** @import {FormSubmissionsRepository} from '#repositories/form-submissions/port.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import {SystemLogsRepository} from '#system-logs/index.js' */

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock('#formsubmission/migration/migration-orchestrator.js', () => ({
  createFormDataMigrator: vi.fn()
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
      app: {
        formSubmissionsRepository: mockFormSubmissionsRepository,
        organisationAdministrationRepository: mockOrganisationsRepository,
        systemLogsRepository: mockSystemLogsRepository
      },
      db: {},
      locker: {
        lock: vi.fn().mockResolvedValue(mockLock)
      }
    }

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
    expect(createFormDataMigrator).toHaveBeenCalledWith(
      mockFormSubmissionsRepository,
      mockOrganisationsRepository,
      mockSystemLogsRepository,
      expect.anything()
    )
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

  it('should migrate nothing when the server lacks a repository it needs', async () => {
    mockServer.app = {
      formSubmissionsRepository: mockFormSubmissionsRepository
    }

    await runFormsDataMigration(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      message: 'Failed to run form data migration',
      err: new Error(
        'The server has not registered organisationAdministrationRepository, systemLogsRepository'
      )
    })
    expect(mockServer.locker.lock).not.toHaveBeenCalled()
    expect(createFormDataMigrator).not.toHaveBeenCalled()
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
