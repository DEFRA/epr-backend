import soleTrader from '#data/fixtures/ea/organisation/non-registered-uk-sole-trader.json' with { type: 'json' }
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runFormsDataMigration } from './run-forms-data-migration.js'
import { logger } from '#common/helpers/logging/logger.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import {
  createInMemoryFormsFileUploadsRepository,
  createInMemoryFormSubmissionsRepository
} from '#forms-submission-data/test-support.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

const soleTraderNumber = toOrganisationNumber(String(soleTrader.orgId))

const soleTraderSubmission = {
  id: soleTrader._id.$oid,
  orgId: soleTrader.orgId,
  rawSubmissionData: soleTrader.rawSubmissionData
}

describe('runFormsDataMigration', () => {
  let server
  let lock

  beforeEach(() => {
    vi.clearAllMocks()

    lock = { free: vi.fn().mockResolvedValue(undefined) }

    server = {
      app: {
        formSubmissionsRepository: createInMemoryFormSubmissionsRepository(
          [],
          [],
          [soleTraderSubmission]
        )(),
        formsFileUploadsRepository: createInMemoryFormsFileUploadsRepository(),
        organisationAdministrationRepository:
          createInMemoryOrganisationsRepository()(),
        systemLogsRepository: createSystemLogsRepository()(logger)
      },
      locker: { lock: vi.fn().mockResolvedValue(lock) }
    }
  })

  it("migrates the forms' organisations into the server's organisations repository", async () => {
    await runFormsDataMigration(server)

    const migrated =
      await server.app.organisationAdministrationRepository.findByOrganisationNumbers(
        [soleTraderNumber]
      )
    expect(migrated).toHaveLength(1)
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Form data migration completed successfully'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('logs a failed migration and frees the lock', async () => {
    const error = new Error('Migration failed')
    server.app.organisationAdministrationRepository = {
      ...server.app.organisationAdministrationRepository,
      findAllIds: () => Promise.reject(error)
    }

    await runFormsDataMigration(server)

    expect(logger.error).toHaveBeenCalledWith({
      message: 'Failed to run form data migration',
      err: error
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('migrates nothing when the server lacks a repository it needs', async () => {
    server.app = {
      formSubmissionsRepository: server.app.formSubmissionsRepository
    }

    await runFormsDataMigration(server)

    expect(logger.error).toHaveBeenCalledWith({
      message: 'Failed to run form data migration',
      err: new Error(
        'The server has not registered formsFileUploadsRepository, organisationAdministrationRepository, systemLogsRepository'
      )
    })
    expect(server.locker.lock).not.toHaveBeenCalled()
  })

  it('migrates nothing when another instance holds the lock', async () => {
    server.locker.lock.mockResolvedValue(null)

    await runFormsDataMigration(server)

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping running form data migration'
    })
    const migrated =
      await server.app.organisationAdministrationRepository.findByOrganisationNumbers(
        [soleTraderNumber]
      )
    expect(migrated).toHaveLength(0)
  })
})
