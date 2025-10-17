import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import { buildFile, buildPendingFile, buildSummaryLog } from './test-data.js'

const createAndInsertSummaryLog = async (
  repository,
  idPrefix,
  overrides = {}
) => {
  const id = `${idPrefix}-${randomUUID()}`
  const summaryLog = buildSummaryLog(overrides)
  await repository.insert(id, summaryLog)
  return { id, initial: await repository.findById(id) }
}

const updateAndFetch = async (repository, id, version, updates) => {
  await repository.update(id, version, updates)
  return repository.findById(id)
}

export const testOptimisticConcurrency = (repositoryFactory) => {
  describe('optimistic concurrency', () => {
    let repository
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    }

    beforeEach(async () => {
      repository = await repositoryFactory(logger)
    })

    describe('version control', () => {
      it('initializes version to 1 on insert', async () => {
        const { initial } = await createAndInsertSummaryLog(
          repository,
          'contract-version-init'
        )

        expect(initial.version).toBe(1)
      })

      it('increments version on successful update', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          repository,
          'contract-version-increment',
          { status: 'preprocessing', file: buildPendingFile() }
        )

        const updated = await updateAndFetch(repository, id, initial.version, {
          status: 'validating'
        })

        expect(updated.version).toBe(2)
        expect(updated.summaryLog.status).toBe('validating')
      })

      it('throws conflict error when updating with stale version', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          repository,
          'contract-stale-version',
          { status: 'preprocessing', file: buildPendingFile() }
        )

        await repository.update(id, initial.version, {
          status: 'validating'
        })

        await expect(
          repository.update(id, initial.version, { status: 'rejected' })
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        const final = await repository.findById(id)
        expect(final.summaryLog.status).toBe('validating')
        expect(final.version).toBe(2)
      })

      it('allows sequential updates with correct versions', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          repository,
          'contract-sequential-updates',
          { status: 'preprocessing', file: buildPendingFile() }
        )

        expect(initial.version).toBe(1)

        let current = await updateAndFetch(repository, id, initial.version, {
          status: 'validating'
        })
        expect(current.version).toBe(2)

        current = await updateAndFetch(repository, id, current.version, {
          status: 'preprocessing'
        })
        const expectedVersionAfterTwoUpdates = 3
        expect(current.version).toBe(expectedVersionAfterTwoUpdates)
        expect(current.summaryLog.status).toBe('preprocessing')
      })

      it('preserves version field integrity across updates', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          repository,
          'contract-version-integrity',
          {
            status: 'preprocessing',
            organisationId: 'org-123',
            registrationId: 'reg-456',
            file: buildPendingFile()
          }
        )

        const updated = await updateAndFetch(repository, id, initial.version, {
          status: 'validating',
          file: buildFile({
            id: initial.summaryLog.file.id,
            name: initial.summaryLog.file.name
          })
        })

        expect(updated.version).toBe(2)
        expect(updated.summaryLog.organisationId).toBe('org-123')
        expect(updated.summaryLog.registrationId).toBe('reg-456')
      })

      it('throws conflict with descriptive message for version mismatch', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          repository,
          'contract-conflict-message',
          { status: 'preprocessing', file: buildPendingFile() }
        )

        await repository.update(id, initial.version, {
          status: 'validating'
        })

        const expectedCurrentVersion = 2
        await expect(
          repository.update(id, initial.version, { status: 'rejected' })
        ).rejects.toMatchObject({
          isBoom: true,
          output: {
            statusCode: 409,
            payload: {
              message: `Version conflict: attempted to update with version ${initial.version} but current version is ${expectedCurrentVersion}`
            }
          }
        })

        const final = await repository.findById(id)
        expect(final.summaryLog.status).toBe('validating')
        expect(final.version).toBe(2)
      })
    })

    describe('concurrent update race conditions', () => {
      it('rejects one of two concurrent updates with same version', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          repository,
          'contract-concurrent',
          { status: 'preprocessing', file: buildPendingFile() }
        )

        const results = await Promise.allSettled([
          repository.update(id, initial.version, { status: 'validating' }),
          repository.update(id, initial.version, { status: 'rejected' })
        ])

        const fulfilled = results.filter((r) => r.status === 'fulfilled')
        const rejected = results.filter((r) => r.status === 'rejected')

        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        expect(rejected[0].reason).toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        const final = await repository.findById(id)
        expect(final.version).toBe(2)
        expect(['validating', 'rejected']).toContain(final.summaryLog.status)
      })
    })

    describe('conflict logging', () => {
      it('logs version conflict with appropriate event metadata', async () => {
        const logger = {
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn()
        }
        const repository = repositoryFactory(logger)

        const { id, initial } = await createAndInsertSummaryLog(
          repository,
          'contract-logging',
          { status: 'preprocessing', file: buildPendingFile() }
        )

        await repository.update(id, initial.version, {
          status: 'validating'
        })

        await expect(
          repository.update(id, initial.version, {
            status: 'rejected'
          })
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
            message: `Version conflict detected for summary log ${id}`,
            event: {
              category: 'database',
              action: 'version_conflict_detected',
              reference: id
            }
          })
        )
      })

      it('includes error details in log when version conflict occurs', async () => {
        const logger = {
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn()
        }
        const repository = repositoryFactory(logger)

        const { id, initial } = await createAndInsertSummaryLog(
          repository,
          'contract-logging-details',
          { status: 'preprocessing', file: buildPendingFile() }
        )

        await repository.update(id, initial.version, {
          status: 'validating'
        })

        await expect(
          repository.update(id, initial.version, {
            status: 'rejected'
          })
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        const logCall = logger.error.mock.calls[0][0]
        expect(logCall.error).toBeInstanceOf(Error)
        const expectedVersion = 2
        expect(logCall.error.message).toBe(
          `Version conflict: attempted to update with version ${initial.version} but current version is ${expectedVersion}`
        )
      })
    })
  })
}
