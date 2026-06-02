import { randomUUID } from 'node:crypto'
import { describe, beforeEach, expect, vi } from 'vitest'
import {
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { buildFile, buildPendingFile, summaryLogFactory } from './test-data.js'
import { waitForVersion } from './test-helpers.js'

const createAndInsertSummaryLog = async (repository, idPrefix, summaryLog) => {
  const id = `${idPrefix}-${randomUUID()}`
  await repository.insert(id, summaryLog)
  return { id, initial: await repository.findById(id) }
}

const updateAndFetch = async (repository, id, version, updates) => {
  await repository.update(id, version, updates)
  return waitForVersion(repository, id, version + 1)
}

export const testOptimisticConcurrency = (it) => {
  describe('optimistic concurrency', () => {
    let repository

    beforeEach(async ({ summaryLogsRepository }) => {
      repository = summaryLogsRepository
    })

    describe('version control', () => {
      it('initializes version to 1 on insert', async () => {
        const { initial } = await createAndInsertSummaryLog(
          repository,
          'contract-version-init',
          summaryLogFactory.validating()
        )

        expect(initial.version).toBe(1)
      })

      it('increments version on successful update', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          repository,
          'contract-version-increment',
          summaryLogFactory.preprocessing({ file: buildPendingFile() })
        )

        const updated = await updateAndFetch(
          repository,
          id,
          initial.version,
          transitionStatus(initial.summaryLog, SUMMARY_LOG_STATUS.VALIDATING)
        )

        expect(updated.version).toBe(2)
        expect(updated.summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATING)
      })

      it('throws conflict error when updating with stale version', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          repository,
          'contract-stale-version',
          summaryLogFactory.preprocessing({ file: buildPendingFile() })
        )

        await repository.update(
          id,
          initial.version,
          transitionStatus(initial.summaryLog, SUMMARY_LOG_STATUS.VALIDATING)
        )

        await expect(
          repository.update(
            id,
            initial.version,
            transitionStatus(initial.summaryLog, SUMMARY_LOG_STATUS.REJECTED)
          )
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        const final = await waitForVersion(repository, id, 2)
        expect(final.summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATING)
        expect(final.version).toBe(2)
      })

      it('allows sequential updates with correct versions', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          repository,
          'contract-sequential-updates',
          summaryLogFactory.preprocessing({ file: buildPendingFile() })
        )

        expect(initial.version).toBe(1)

        let current = await updateAndFetch(
          repository,
          id,
          initial.version,
          transitionStatus(initial.summaryLog, SUMMARY_LOG_STATUS.VALIDATING)
        )
        expect(current.version).toBe(2)

        current = await updateAndFetch(
          repository,
          id,
          current.version,
          transitionStatus(current.summaryLog, SUMMARY_LOG_STATUS.VALIDATED)
        )
        const expectedVersionAfterTwoUpdates = 3
        expect(current.version).toBe(expectedVersionAfterTwoUpdates)
        expect(current.summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      })

      it('preserves version field integrity across updates', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          repository,
          'contract-version-integrity',
          summaryLogFactory.preprocessing({
            organisationId: 'org-123',
            registrationId: 'reg-456',
            file: buildPendingFile()
          })
        )

        const updated = await updateAndFetch(repository, id, initial.version, {
          ...transitionStatus(
            initial.summaryLog,
            SUMMARY_LOG_STATUS.VALIDATING
          ),
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
          summaryLogFactory.preprocessing({ file: buildPendingFile() })
        )

        await repository.update(
          id,
          initial.version,
          transitionStatus(initial.summaryLog, SUMMARY_LOG_STATUS.VALIDATING)
        )

        const expectedCurrentVersion = 2
        await expect(
          repository.update(
            id,
            initial.version,
            transitionStatus(initial.summaryLog, SUMMARY_LOG_STATUS.REJECTED)
          )
        ).rejects.toMatchObject({
          isBoom: true,
          output: {
            statusCode: 409,
            payload: {
              message: `Version conflict: attempted to update with version ${initial.version} but current version is ${expectedCurrentVersion}`
            }
          }
        })

        const final = await waitForVersion(repository, id, 2)
        expect(final.summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATING)
        expect(final.version).toBe(2)
      })
    })

    describe('concurrent update race conditions', () => {
      it('rejects one of two concurrent updates with same version', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          repository,
          'contract-concurrent',
          summaryLogFactory.preprocessing({ file: buildPendingFile() })
        )

        const results = await Promise.allSettled([
          repository.update(
            id,
            initial.version,
            transitionStatus(initial.summaryLog, SUMMARY_LOG_STATUS.VALIDATING)
          ),
          repository.update(
            id,
            initial.version,
            transitionStatus(initial.summaryLog, SUMMARY_LOG_STATUS.REJECTED)
          )
        ])

        const fulfilled = results.filter((r) => r.status === 'fulfilled')
        const rejected = results.filter((r) => r.status === 'rejected')

        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        expect(rejected[0].reason).toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        const final = await waitForVersion(repository, id, 2)
        expect(final.version).toBe(2)
        expect([
          SUMMARY_LOG_STATUS.VALIDATING,
          SUMMARY_LOG_STATUS.REJECTED
        ]).toContain(final.summaryLog.status)
      })
    })

    describe('conflict logging', () => {
      it('logs version conflict with appropriate event metadata', async ({
        summaryLogsRepositoryFactory
      }) => {
        const logger = {
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn()
        }
        const repository = summaryLogsRepositoryFactory(logger)

        const { id, initial } = await createAndInsertSummaryLog(
          repository,
          'contract-logging',
          summaryLogFactory.preprocessing({ file: buildPendingFile() })
        )

        await repository.update(
          id,
          initial.version,
          transitionStatus(initial.summaryLog, SUMMARY_LOG_STATUS.VALIDATING)
        )

        await expect(
          repository.update(
            id,
            initial.version,
            transitionStatus(initial.summaryLog, SUMMARY_LOG_STATUS.REJECTED)
          )
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            err: expect.any(Error),
            message: `Version conflict detected for summary log ${id}`,
            event: {
              category: 'database',
              action: 'version_conflict_detected',
              reference: id
            }
          })
        )
      })

      it('includes error details in log when version conflict occurs', async ({
        summaryLogsRepositoryFactory
      }) => {
        const logger = {
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn()
        }
        const repository = summaryLogsRepositoryFactory(logger)

        const { id, initial } = await createAndInsertSummaryLog(
          repository,
          'contract-logging-details',
          summaryLogFactory.preprocessing({ file: buildPendingFile() })
        )

        await repository.update(
          id,
          initial.version,
          transitionStatus(initial.summaryLog, SUMMARY_LOG_STATUS.VALIDATING)
        )

        await expect(
          repository.update(
            id,
            initial.version,
            transitionStatus(initial.summaryLog, SUMMARY_LOG_STATUS.REJECTED)
          )
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        const logCall = logger.error.mock.calls[0][0]
        expect(logCall.err).toBeInstanceOf(Error)
        const expectedVersion = 2
        expect(logCall.err.message).toBe(
          `Version conflict: attempted to update with version ${initial.version} but current version is ${expectedVersion}`
        )
      })
    })
  })
}
