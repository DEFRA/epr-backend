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

const testVersionInitialization = (getRepository) => {
  it('initializes version to 1 on insert', async () => {
    const { initial } = await createAndInsertSummaryLog(
      getRepository,
      'contract-version-init'
    )

    expect(initial.version).toBe(1)
  })
}

const testVersionIncrement = (getRepository) => {
  it('increments version on successful update', async () => {
    const { id, initial } = await createAndInsertSummaryLog(
      getRepository,
      'contract-version-increment',
      { status: 'preprocessing', file: buildPendingFile() }
    )

    const updated = await updateAndFetch(getRepository, id, initial.version, {
      status: 'validating'
    })

    expect(updated.version).toBe(2)
    expect(updated.status).toBe('validating')
  })
}

const testStaleVersionConflict = (getRepository) => {
  it('throws conflict error when updating with stale version', async () => {
    const { id, initial } = await createAndInsertSummaryLog(
      getRepository,
      'contract-stale-version',
      { status: 'preprocessing', file: buildPendingFile() }
    )

    await getRepository().update(id, initial.version, { status: 'validating' })

    await expectConflictError(
      getRepository().update(id, initial.version, { status: 'rejected' })
    )
  })
}

const testSequentialUpdates = (getRepository) => {
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
      status: 'validated'
    })
    const expectedVersionAfterTwoUpdates = 3
    expect(current.version).toBe(expectedVersionAfterTwoUpdates)
    expect(current.status).toBe('validated')
  })
}

const testVersionIntegrity = (getRepository) => {
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

    const updated = await updateAndFetch(getRepository, id, initial.version, {
      status: 'validating',
      file: buildFile({
        id: initial.file.id,
        name: initial.file.name
      })
    })

    expect(updated.version).toBe(2)
    expect(updated.organisationId).toBe('org-123')
    expect(updated.registrationId).toBe('reg-456')
  })
}

const testConflictMessage = (getRepository) => {
  it('throws conflict with descriptive message for version mismatch', async () => {
    const { id, initial } = await createAndInsertSummaryLog(
      getRepository,
      'contract-conflict-message',
      { status: 'preprocessing', file: buildPendingFile() }
    )

    await getRepository().update(id, initial.version, { status: 'validating' })

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
}

export const testOptimisticConcurrency = (getRepository) => {
  describe('optimistic concurrency control', () => {
    testVersionInitialization(getRepository)
    testVersionIncrement(getRepository)
    testStaleVersionConflict(getRepository)
    testSequentialUpdates(getRepository)
    testVersionIntegrity(getRepository)
    testConflictMessage(getRepository)
  })
}

export const testOptimisticConcurrencyRaceConditions = (getRepository) => {
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
}
