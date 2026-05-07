import { describe, beforeEach, expect, vi } from 'vitest'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { buildAwaitingAuthorisationPrn, buildDraftPrn } from './test-data.js'

const updaterUser = { id: 'user-raiser', name: 'Raiser User' }
const issuerUser = { id: 'user-issuer', name: 'Issuer User' }

const updateToAwaitingAuthorisation = (repository, prn) =>
  repository.updateStatus({
    id: prn.id,
    version: prn.version,
    status: PRN_STATUS.AWAITING_AUTHORISATION,
    updatedBy: updaterUser,
    updatedAt: new Date()
  })

const updateToDeleted = (repository, prn) =>
  repository.updateStatus({
    id: prn.id,
    version: prn.version,
    status: PRN_STATUS.DELETED,
    updatedBy: updaterUser,
    updatedAt: new Date()
  })

export const testOptimisticConcurrency = (it) => {
  describe('optimistic concurrency', () => {
    let repository

    beforeEach(async ({ prnRepository }) => {
      repository = prnRepository
    })

    describe('version control', () => {
      it('initialises version to 1 on create', async () => {
        const created = await repository.create(buildDraftPrn())

        expect(created.version).toBe(1)
      })

      it('persists version 1 so it can be read back', async () => {
        const created = await repository.create(buildDraftPrn())

        const found = await repository.findById(created.id)

        expect(found.version).toBe(1)
      })

      it('increments version on successful updateStatus', async () => {
        const created = await repository.create(buildDraftPrn())

        const updated = await updateToAwaitingAuthorisation(repository, created)

        expect(updated.version).toBe(2)
        expect(updated.status.currentStatus).toBe(
          PRN_STATUS.AWAITING_AUTHORISATION
        )
      })

      it('exposes the new version after updateStatus through findById', async () => {
        const created = await repository.create(buildDraftPrn())
        await updateToAwaitingAuthorisation(repository, created)

        const found = await repository.findById(created.id)

        expect(found.version).toBe(2)
      })

      it('allows sequential updates that thread the version through', async () => {
        const created = await repository.create(buildAwaitingAuthorisationPrn())

        const issued = await repository.updateStatus({
          id: created.id,
          version: created.version,
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          updatedBy: issuerUser,
          updatedAt: new Date(),
          prnNumber: `ER26${Date.now().toString().slice(-5)}A`
        })
        expect(issued.version).toBe(2)

        const accepted = await repository.updateStatus({
          id: created.id,
          version: issued.version,
          status: PRN_STATUS.ACCEPTED,
          updatedBy: { id: 'producer', name: 'Producer User' },
          updatedAt: new Date()
        })

        const expectedFinalVersion = 3
        expect(accepted.version).toBe(expectedFinalVersion)
        expect(accepted.status.currentStatus).toBe(PRN_STATUS.ACCEPTED)
      })

      it('throws Boom.conflict when updating with a stale version', async () => {
        const created = await repository.create(buildDraftPrn())

        await updateToAwaitingAuthorisation(repository, created)

        await expect(
          updateToDeleted(repository, created)
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })
      })

      it('does not apply the update when the version is stale', async () => {
        const created = await repository.create(buildDraftPrn())

        await updateToAwaitingAuthorisation(repository, created)
        await updateToDeleted(repository, created).catch(() => {})

        const found = await repository.findById(created.id)
        expect(found.status.currentStatus).toBe(
          PRN_STATUS.AWAITING_AUTHORISATION
        )
        expect(found.version).toBe(2)
      })

      it('uses a descriptive message identifying expected and actual versions', async () => {
        const created = await repository.create(buildDraftPrn())
        await updateToAwaitingAuthorisation(repository, created)

        const expectedCurrentVersion = 2
        await expect(
          updateToDeleted(repository, created)
        ).rejects.toMatchObject({
          isBoom: true,
          output: {
            statusCode: 409,
            payload: {
              message: `Version conflict: attempted to update PRN ${created.id} with version ${created.version} but current version is ${expectedCurrentVersion}`
            }
          }
        })
      })
    })

    describe('concurrent update race conditions', () => {
      it('rejects one of two concurrent updates with the same version', async () => {
        const created = await repository.create(buildDraftPrn())

        const results = await Promise.allSettled([
          updateToAwaitingAuthorisation(repository, created),
          updateToDeleted(repository, created)
        ])

        const fulfilled = results.filter((r) => r.status === 'fulfilled')
        const rejected = results.filter((r) => r.status === 'rejected')

        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        expect(rejected[0].reason).toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        const final = await repository.findById(created.id)
        expect(final.version).toBe(2)
        expect([
          PRN_STATUS.AWAITING_AUTHORISATION,
          PRN_STATUS.DELETED
        ]).toContain(final.status.currentStatus)
      })
    })

    describe('conflict logging', () => {
      it('logs version conflict with database/version_conflict_detected event metadata', async ({
        prnRepositoryFactory
      }) => {
        const logger = {
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn()
        }
        const repo = prnRepositoryFactory(logger)
        const created = await repo.create(buildDraftPrn())
        await updateToAwaitingAuthorisation(repo, created)

        await expect(updateToDeleted(repo, created)).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            err: expect.any(Error),
            message: `Version conflict detected for PRN ${created.id}`,
            event: {
              category: 'database',
              action: 'version_conflict_detected',
              reference: created.id
            }
          })
        )
      })

      it('includes the conflict message on the logged error', async ({
        prnRepositoryFactory
      }) => {
        const logger = {
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn()
        }
        const repo = prnRepositoryFactory(logger)
        const created = await repo.create(buildDraftPrn())
        await updateToAwaitingAuthorisation(repo, created)

        await expect(updateToDeleted(repo, created)).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        const logCall = logger.error.mock.calls[0][0]
        expect(logCall.err).toBeInstanceOf(Error)
        const expectedCurrentVersion = 2
        expect(logCall.err.message).toBe(
          `Version conflict: attempted to update PRN ${created.id} with version ${created.version} but current version is ${expectedCurrentVersion}`
        )
      })
    })
  })
}
