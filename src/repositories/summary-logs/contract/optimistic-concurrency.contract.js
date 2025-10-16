import { randomUUID } from 'node:crypto'
import { buildFile, buildPendingFile, buildSummaryLog } from './test-data.js'

const createAndInsertSummaryLog = async (
  getRepository,
  idPrefix,
  overrides = {}
) => {
  const id = `${idPrefix}-${randomUUID()}`
  const summaryLog = buildSummaryLog(id, overrides)
  await getRepository().insert(summaryLog)
  return { id, initial: await getRepository().findById(id) }
}

const updateAndFetch = async (getRepository, id, version, updates) => {
  await getRepository().update(id, version, updates)
  return getRepository().findById(id)
}

const expectConflictError = (promise) =>
  expect(promise).rejects.toMatchObject({
    isBoom: true,
    output: { statusCode: 409 }
  })

export const testOptimisticConcurrency = (getRepository, getLogger) => {
  describe('optimistic concurrency', () => {
    describe('version control', () => {
      it('initializes version to 1 on insert', async () => {
        const { initial } = await createAndInsertSummaryLog(
          getRepository,
          'contract-version-init'
        )

        expect(initial.version).toBe(1)
      })

      it('increments version on successful update', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          getRepository,
          'contract-version-increment',
          { status: 'preprocessing', file: buildPendingFile() }
        )

        const updated = await updateAndFetch(
          getRepository,
          id,
          initial.version,
          {
            status: 'validating'
          }
        )

        expect(updated.version).toBe(2)
        expect(updated.status).toBe('validating')
      })

      it('throws conflict error when updating with stale version', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          getRepository,
          'contract-stale-version',
          { status: 'preprocessing', file: buildPendingFile() }
        )

        await getRepository().update(id, initial.version, {
          status: 'validating'
        })

        await expectConflictError(
          getRepository().update(id, initial.version, { status: 'rejected' })
        )
      })

      it('allows sequential updates with correct versions', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          getRepository,
          'contract-sequential-updates',
          { status: 'preprocessing', file: buildPendingFile() }
        )

        expect(initial.version).toBe(1)

        let current = await updateAndFetch(getRepository, id, initial.version, {
          status: 'validating'
        })
        expect(current.version).toBe(2)

        current = await updateAndFetch(getRepository, id, current.version, {
          status: 'preprocessing'
        })
        const expectedVersionAfterTwoUpdates = 3
        expect(current.version).toBe(expectedVersionAfterTwoUpdates)
        expect(current.status).toBe('preprocessing')
      })

      it('preserves version field integrity across updates', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          getRepository,
          'contract-version-integrity',
          {
            status: 'preprocessing',
            organisationId: 'org-123',
            registrationId: 'reg-456',
            file: buildPendingFile()
          }
        )

        const updated = await updateAndFetch(
          getRepository,
          id,
          initial.version,
          {
            status: 'validating',
            file: buildFile({
              id: initial.file.id,
              name: initial.file.name
            })
          }
        )

        expect(updated.version).toBe(2)
        expect(updated.organisationId).toBe('org-123')
        expect(updated.registrationId).toBe('reg-456')
      })

      it('throws conflict with descriptive message for version mismatch', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          getRepository,
          'contract-conflict-message',
          { status: 'preprocessing', file: buildPendingFile() }
        )

        await getRepository().update(id, initial.version, {
          status: 'validating'
        })

        await expect(
          getRepository().update(id, initial.version, { status: 'rejected' })
        ).rejects.toMatchObject({
          isBoom: true,
          output: {
            statusCode: 409,
            payload: {
              message: expect.stringMatching(
                /version.*conflict|concurrent.*update|stale.*version/i
              )
            }
          }
        })
      })
    })

    describe('concurrent update race conditions', () => {
      it('rejects one of two concurrent updates with same version', async () => {
        const { id, initial } = await createAndInsertSummaryLog(
          getRepository,
          'contract-concurrent',
          { status: 'preprocessing', file: buildPendingFile() }
        )

        const results = await Promise.allSettled([
          getRepository().update(id, initial.version, { status: 'validating' }),
          getRepository().update(id, initial.version, { status: 'rejected' })
        ])

        const fulfilled = results.filter((r) => r.status === 'fulfilled')
        const rejected = results.filter((r) => r.status === 'rejected')

        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        expect(rejected[0].reason).toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        const final = await getRepository().findById(id)
        expect(final.version).toBe(2)
        expect(['validating', 'rejected']).toContain(final.status)
      })
    })

    describe('conflict logging', () => {
      it('logs version conflict with appropriate event metadata', async () => {
        const logger = getLogger()
        logger.error.mockClear()

        const { id, initial } = await createAndInsertSummaryLog(
          getRepository,
          'contract-logging',
          { status: 'preprocessing', file: buildPendingFile() }
        )

        await getRepository().update(id, initial.version, {
          status: 'validating'
        })

        await expect(
          getRepository().update(id, initial.version, {
            status: 'rejected'
          })
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
            message: expect.stringMatching(
              /version.*conflict|concurrent.*update/i
            ),
            event: {
              category: 'database',
              action: 'version_conflict_detected',
              reference: id
            }
          })
        )
      })

      it('includes error details in log when version conflict occurs', async () => {
        const logger = getLogger()
        logger.error.mockClear()

        const { id, initial } = await createAndInsertSummaryLog(
          getRepository,
          'contract-logging-details',
          { status: 'preprocessing', file: buildPendingFile() }
        )

        await getRepository().update(id, initial.version, {
          status: 'validating'
        })

        await expect(
          getRepository().update(id, initial.version, {
            status: 'rejected'
          })
        ).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        const logCall = logger.error.mock.calls[0][0]
        expect(logCall.error).toBeInstanceOf(Error)
        expect(logCall.error.message).toMatch(
          /version.*conflict|concurrent.*update/i
        )
      })
    })
  })
}
