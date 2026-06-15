import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { createSystemLogsRepository as createInMemorySystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import {
  buildOrganisation,
  buildRegistration,
  buildAccreditation
} from '#repositories/organisations/contract/test-data.js'

import { runDuplicateAccreditationLinkMigration } from './run-duplicate-accreditation-link-migration.js'
import { auditDuplicateAccreditationLinkMigration } from '#auditing/duplicate-accreditation-link-migration.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))
vi.mock('#repositories/system-logs/mongodb.js', () => ({
  createSystemLogsRepository: vi.fn()
}))
vi.mock('#auditing/duplicate-accreditation-link-migration.js', () => ({
  auditDuplicateAccreditationLinkMigration: vi.fn().mockResolvedValue(undefined)
}))

const buildServer = (featureFlagEnabled = false) => {
  const mockLock = { free: vi.fn().mockResolvedValue(undefined) }
  return {
    db: {},
    locker: {
      lock: vi.fn().mockResolvedValue(mockLock)
    },
    featureFlags: {
      isFixDuplicateAccreditationLinksEnabled: () => featureFlagEnabled
    },
    _mockLock: mockLock
  }
}

/**
 * Seeds the mocked createOrganisationsRepository with an in-memory repo backed
 * by the given organisations. Returns a shared spy object whose `replace`
 * property is set once the factory is first invoked by the migration.
 *
 * Pass `mockReplace: true` to replace the `replace` method with a no-op spy
 * so that Joi/status-transition validation inside the inmemory impl is bypassed.
 * Use this when the test data contains status combinations (e.g. cancelled or
 * approved registrations built from the base fixture) that would fail the
 * schema validation inside `prepareForReplace`, and you only need to assert
 * what was passed to `replace`, not that the DB write succeeded.
 */
const seedRepositories = (organisations, { mockReplace = false } = {}) => {
  const inMemoryFactory = createInMemoryOrganisationsRepository(organisations)
  const inMemorySystemLogsFactory = createInMemorySystemLogsRepository()
  /** @type {{ replace: import('vitest').MockInstance | null }} */
  const spy = { replace: null }

  vi.mocked(createOrganisationsRepository).mockResolvedValue(() => {
    const repo = inMemoryFactory()
    if (mockReplace) {
      repo.replace = vi.fn().mockResolvedValue(undefined)
      spy.replace = /** @type {import('vitest').MockInstance} */ (
        /** @type {unknown} */ (repo.replace)
      )
    } else {
      spy.replace = vi.spyOn(repo, 'replace')
    }
    return repo
  })

  vi.mocked(createSystemLogsRepository).mockResolvedValue(
    inMemorySystemLogsFactory
  )

  return spy
}

const buildAccreditationId = () => new ObjectId().toString()

/**
 * Builds a registration with an explicit statusHistory so that the inmemory
 * repo's getCurrentStatus returns the desired status.
 */
const buildRegistrationWithStatus = (status, overrides = {}) =>
  buildRegistration({
    statusHistory: [
      { status: 'created', updatedAt: new Date('2024-01-01') },
      ...(status === 'created'
        ? []
        : [{ status, updatedAt: new Date('2024-02-01') }])
    ],
    ...overrides
  })

describe('runDuplicateAccreditationLinkMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('locking', () => {
    it('acquires a lock scoped to the migration and releases it afterwards', async () => {
      const server = buildServer(true)
      seedRepositories([])

      await runDuplicateAccreditationLinkMigration(server)

      expect(server.locker.lock).toHaveBeenCalledWith(
        'duplicate-accreditation-link-migration'
      )
      expect(server._mockLock.free).toHaveBeenCalled()
    })

    it('skips the migration when the lock is held by another instance', async () => {
      const server = buildServer(true)
      server.locker.lock.mockResolvedValue(null)

      await runDuplicateAccreditationLinkMigration(server)

      expect(createOrganisationsRepository).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            'Unable to obtain lock, skipping duplicate accreditation link migration'
        })
      )
    })

    it('releases the lock and logs an error when the migration throws', async () => {
      const server = buildServer(true)
      const error = new Error('mongo unavailable')
      vi.mocked(createOrganisationsRepository).mockRejectedValue(error)

      await runDuplicateAccreditationLinkMigration(server)

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to run duplicate accreditation link migration',
          err: error
        })
      )
      expect(server._mockLock.free).toHaveBeenCalled()
    })

    it('tolerates the locker itself throwing', async () => {
      const server = buildServer(true)
      const error = new Error('locker unavailable')
      server.locker.lock.mockRejectedValue(error)

      await runDuplicateAccreditationLinkMigration(server)

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to run duplicate accreditation link migration',
          err: error
        })
      )
    })
  })

  describe('no duplicate links', () => {
    it('makes no changes and logs a zero summary when no accreditation is shared', async () => {
      const server = buildServer(true)
      const accId = buildAccreditationId()
      const acc = buildAccreditation({ id: accId })
      const reg = buildRegistrationWithStatus('created', {
        accreditationId: accId
      })
      const org = buildOrganisation({
        registrations: [reg],
        accreditations: [acc]
      })
      const spy = seedRepositories([org])

      await runDuplicateAccreditationLinkMigration(server)

      expect(spy.replace).not.toHaveBeenCalled()
      expect(auditDuplicateAccreditationLinkMigration).not.toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Duplicate accreditation link migration complete: isDryRun=false totalDuplicateAccreditations=0 totalOrgsUpdated=0 totalOrgsFailed=0'
      })
    })

    it('skips registrations without an accreditationId when counting duplicates', async () => {
      const server = buildServer(true)
      const accId = buildAccreditationId()
      const acc = buildAccreditation({ id: accId })
      const regWithAcc = buildRegistrationWithStatus('created', {
        accreditationId: accId
      })
      const regWithoutAcc = buildRegistrationWithStatus('created', {
        accreditationId: undefined
      })
      const org = buildOrganisation({
        registrations: [regWithAcc, regWithoutAcc],
        accreditations: [acc]
      })
      const spy = seedRepositories([org])

      await runDuplicateAccreditationLinkMigration(server)

      expect(spy.replace).not.toHaveBeenCalled()
      expect(auditDuplicateAccreditationLinkMigration).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Duplicate accreditation link migration complete: isDryRun=false totalDuplicateAccreditations=0 totalOrgsUpdated=0 totalOrgsFailed=0'
      })
    })
  })

  describe('dry-run mode (feature flag disabled)', () => {
    it('logs what would change but does not call replace', async () => {
      const server = buildServer(false)
      const accId = buildAccreditationId()
      const acc = buildAccreditation({ id: accId })
      const reg1 = buildRegistrationWithStatus('created', {
        accreditationId: accId,
        formSubmission: {
          id: new ObjectId().toString(),
          time: new Date('2024-01-01')
        }
      })
      const reg2 = buildRegistrationWithStatus('created', {
        accreditationId: accId,
        formSubmission: {
          id: new ObjectId().toString(),
          time: new Date('2024-06-01')
        }
      })
      const org = buildOrganisation({
        registrations: [reg1, reg2],
        accreditations: [acc]
      })
      const spy = seedRepositories([org])

      await runDuplicateAccreditationLinkMigration(server)

      expect(spy.replace).not.toHaveBeenCalled()
      expect(auditDuplicateAccreditationLinkMigration).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            `Dry run — would fix duplicate accreditation links: organisationId=${org.id}`
          )
        })
      )
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Duplicate accreditation link migration complete: isDryRun=true totalDuplicateAccreditations=1 totalOrgsUpdated=0 totalOrgsFailed=0'
      })
    })
  })

  describe('two registrations both in created status', () => {
    it('keeps the registration with the latest formSubmission.time and unlinks the earlier one', async () => {
      const server = buildServer(true)
      const accId = buildAccreditationId()
      const acc = buildAccreditation({ id: accId })
      const olderReg = buildRegistrationWithStatus('created', {
        accreditationId: accId,
        formSubmission: {
          id: new ObjectId().toString(),
          time: new Date('2024-01-01')
        }
      })
      const newerReg = buildRegistrationWithStatus('created', {
        accreditationId: accId,
        formSubmission: {
          id: new ObjectId().toString(),
          time: new Date('2024-06-01')
        }
      })
      const org = buildOrganisation({
        registrations: [olderReg, newerReg],
        accreditations: [acc]
      })
      const spy = seedRepositories([org])

      await runDuplicateAccreditationLinkMigration(server)

      expect(spy.replace).toHaveBeenCalledOnce()
      const [, , updatedOrg] = /** @type {import('vitest').MockInstance} */ (
        spy.replace
      ).mock.calls[0]
      const olderUpdated = updatedOrg.registrations.find(
        (r) => r.id === olderReg.id
      )
      const newerUpdated = updatedOrg.registrations.find(
        (r) => r.id === newerReg.id
      )
      expect(olderUpdated.accreditationId).toBeUndefined()
      expect(newerUpdated.accreditationId).toBe(accId)

      expect(auditDuplicateAccreditationLinkMigration).toHaveBeenCalledWith(
        expect.anything(),
        org.id,
        expect.objectContaining({ id: org.id }),
        expect.objectContaining({
          registrations: expect.arrayContaining([
            expect.objectContaining({
              id: newerReg.id,
              accreditationId: accId
            }),
            expect.objectContaining({ id: olderReg.id })
          ])
        })
      )

      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Duplicate accreditation link migration complete: isDryRun=false totalDuplicateAccreditations=1 totalOrgsUpdated=1 totalOrgsFailed=0'
      })
    })
  })

  describe('two registrations, one created and one non-created', () => {
    it('keeps the non-created registration and unlinks the created one', async () => {
      const server = buildServer(true)
      const accId = buildAccreditationId()
      const acc = buildAccreditation({ id: accId })
      const createdReg = buildRegistrationWithStatus('created', {
        accreditationId: accId,
        formSubmission: {
          id: new ObjectId().toString(),
          time: new Date('2024-06-01')
        }
      })
      const approvedReg = buildRegistrationWithStatus('approved', {
        accreditationId: accId,
        formSubmission: {
          id: new ObjectId().toString(),
          time: new Date('2023-01-01')
        }
      })
      const org = buildOrganisation({
        registrations: [createdReg, approvedReg],
        accreditations: [acc]
      })
      const spy = seedRepositories([org], { mockReplace: true })

      await runDuplicateAccreditationLinkMigration(server)

      expect(spy.replace).toHaveBeenCalledOnce()
      const [, , updatedOrg] = /** @type {import('vitest').MockInstance} */ (
        spy.replace
      ).mock.calls[0]
      const createdUpdated = updatedOrg.registrations.find(
        (r) => r.id === createdReg.id
      )
      const approvedUpdated = updatedOrg.registrations.find(
        (r) => r.id === approvedReg.id
      )
      expect(createdUpdated.accreditationId).toBeUndefined()
      expect(approvedUpdated.accreditationId).toBe(accId)

      expect(auditDuplicateAccreditationLinkMigration).toHaveBeenCalledWith(
        expect.anything(),
        org.id,
        expect.objectContaining({ id: org.id }),
        expect.objectContaining({
          registrations: expect.arrayContaining([
            expect.objectContaining({
              id: approvedReg.id,
              accreditationId: accId
            }),
            expect.objectContaining({ id: createdReg.id })
          ])
        })
      )
    })
  })

  describe('two registrations both in non-created status (approved + cancelled)', () => {
    it('warns and skips without calling replace', async () => {
      const server = buildServer(true)
      const accId = buildAccreditationId()
      const acc = buildAccreditation({ id: accId })
      const approvedReg = buildRegistrationWithStatus('approved', {
        accreditationId: accId,
        formSubmission: {
          id: new ObjectId().toString(),
          time: new Date('2024-01-01')
        }
      })
      const cancelledReg = buildRegistrationWithStatus('cancelled', {
        accreditationId: accId,
        formSubmission: {
          id: new ObjectId().toString(),
          time: new Date('2024-06-01')
        }
      })
      const org = buildOrganisation({
        registrations: [approvedReg, cancelledReg],
        accreditations: [acc]
      })
      const spy = seedRepositories([org])

      await runDuplicateAccreditationLinkMigration(server)

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            `Duplicate accreditation link skipped (multiple non-created registrations): organisationId=${org.id} accreditationId=${accId}`
          )
        })
      )
      expect(spy.replace).not.toHaveBeenCalled()
      expect(auditDuplicateAccreditationLinkMigration).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Duplicate accreditation link migration complete: isDryRun=false totalDuplicateAccreditations=1 totalOrgsUpdated=0 totalOrgsFailed=0'
      })
    })
  })

  describe('three registrations all in created status', () => {
    it('keeps the latest by formSubmission.time and unlinks the other two', async () => {
      const server = buildServer(true)
      const accId = buildAccreditationId()
      const acc = buildAccreditation({ id: accId })
      const reg1 = buildRegistrationWithStatus('created', {
        accreditationId: accId,
        formSubmission: {
          id: new ObjectId().toString(),
          time: new Date('2024-01-01')
        }
      })
      const reg2 = buildRegistrationWithStatus('created', {
        accreditationId: accId,
        formSubmission: {
          id: new ObjectId().toString(),
          time: new Date('2024-09-01')
        }
      })
      const reg3 = buildRegistrationWithStatus('created', {
        accreditationId: accId,
        formSubmission: {
          id: new ObjectId().toString(),
          time: new Date('2024-03-01')
        }
      })
      const org = buildOrganisation({
        registrations: [reg1, reg2, reg3],
        accreditations: [acc]
      })
      const spy = seedRepositories([org])

      await runDuplicateAccreditationLinkMigration(server)

      expect(spy.replace).toHaveBeenCalledOnce()
      const [, , updatedOrg] = /** @type {import('vitest').MockInstance} */ (
        spy.replace
      ).mock.calls[0]
      const reg1Updated = updatedOrg.registrations.find((r) => r.id === reg1.id)
      const reg2Updated = updatedOrg.registrations.find((r) => r.id === reg2.id)
      const reg3Updated = updatedOrg.registrations.find((r) => r.id === reg3.id)
      expect(reg1Updated.accreditationId).toBeUndefined()
      expect(reg2Updated.accreditationId).toBe(accId)
      expect(reg3Updated.accreditationId).toBeUndefined()

      expect(auditDuplicateAccreditationLinkMigration).toHaveBeenCalledWith(
        expect.anything(),
        org.id,
        expect.objectContaining({ id: org.id }),
        expect.objectContaining({
          registrations: expect.arrayContaining([
            expect.objectContaining({ id: reg2.id, accreditationId: accId }),
            expect.objectContaining({ id: reg1.id }),
            expect.objectContaining({ id: reg3.id })
          ])
        })
      )
    })
  })

  describe('summary pre-update logging', () => {
    it('logs accreditation id and linked registration ids and statuses before each update', async () => {
      const server = buildServer(true)
      const accId = buildAccreditationId()
      const acc = buildAccreditation({ id: accId })
      const reg1 = buildRegistrationWithStatus('created', {
        accreditationId: accId,
        formSubmission: {
          id: new ObjectId().toString(),
          time: new Date('2024-01-01')
        }
      })
      const reg2 = buildRegistrationWithStatus('created', {
        accreditationId: accId,
        formSubmission: {
          id: new ObjectId().toString(),
          time: new Date('2024-06-01')
        }
      })
      const org = buildOrganisation({
        registrations: [reg1, reg2],
        accreditations: [acc]
      })
      seedRepositories([org])

      await runDuplicateAccreditationLinkMigration(server)

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            `Duplicate accreditation link: organisationId=${org.id} accreditationId=${accId}`
          )
        })
      )
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(reg1.id)
        })
      )
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(reg2.id)
        })
      )
    })
  })

  describe('error resilience', () => {
    it('continues processing remaining organisations after a per-org update failure and logs totals correctly', async () => {
      const server = buildServer(true)
      const accId1 = buildAccreditationId()
      const accId2 = buildAccreditationId()

      const org1 = buildOrganisation({
        registrations: [
          buildRegistrationWithStatus('created', {
            accreditationId: accId1,
            formSubmission: {
              id: new ObjectId().toString(),
              time: new Date('2024-01-01')
            }
          }),
          buildRegistrationWithStatus('created', {
            accreditationId: accId1,
            formSubmission: {
              id: new ObjectId().toString(),
              time: new Date('2024-06-01')
            }
          })
        ],
        accreditations: [buildAccreditation({ id: accId1 })]
      })

      const org2 = buildOrganisation({
        registrations: [
          buildRegistrationWithStatus('created', {
            accreditationId: accId2,
            formSubmission: {
              id: new ObjectId().toString(),
              time: new Date('2024-01-01')
            }
          }),
          buildRegistrationWithStatus('created', {
            accreditationId: accId2,
            formSubmission: {
              id: new ObjectId().toString(),
              time: new Date('2024-06-01')
            }
          })
        ],
        accreditations: [buildAccreditation({ id: accId2 })]
      })

      let replaceCallCount = 0
      const inMemoryFactory = createInMemoryOrganisationsRepository(
        // @ts-expect-error buildOrganisation returns Omit<Organisation, 'status'> — status is computed at read time
        [org1, org2]
      )

      vi.mocked(createOrganisationsRepository).mockResolvedValue(() => {
        const repo = inMemoryFactory()
        const originalReplace = repo.replace.bind(repo)
        repo.replace = async (...args) => {
          replaceCallCount++
          if (replaceCallCount === 1) {
            throw new Error('simulated replace failure')
          }
          return originalReplace(...args)
        }
        return repo
      })

      vi.mocked(createSystemLogsRepository).mockResolvedValue(
        createInMemorySystemLogsRepository()
      )

      await runDuplicateAccreditationLinkMigration(server)

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            `Failed to fix duplicate accreditation links for organisation: organisationId=${org1.id}`
          )
        })
      )
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Duplicate accreditation link migration complete: isDryRun=false totalDuplicateAccreditations=2 totalOrgsUpdated=1 totalOrgsFailed=1'
      })
    })
  })
})
