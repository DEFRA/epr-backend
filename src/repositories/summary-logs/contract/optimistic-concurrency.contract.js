import { randomUUID } from 'node:crypto'
import { buildFile, buildPendingFile, buildSummaryLog } from './test-data.js'

const testVersionInitialization = (getRepository) => {
  it('initializes version to 1 on insert', async () => {
    const id = `contract-version-init-${randomUUID()}`
    const summaryLog = buildSummaryLog(id)

    await getRepository().insert(summaryLog)
    const found = await getRepository().findById(id)

    expect(found.version).toBe(1)
  })
}

const testVersionIncrement = (getRepository) => {
  it('increments version on successful update', async () => {
    const id = `contract-version-increment-${randomUUID()}`
    const summaryLog = buildSummaryLog(id, {
      status: 'preprocessing',
      file: buildPendingFile()
    })

    await getRepository().insert(summaryLog)
    const initial = await getRepository().findById(id)

    await getRepository().update(id, initial.version, {
      status: 'validating'
    })

    const updated = await getRepository().findById(id)
    expect(updated.version).toBe(2)
    expect(updated.status).toBe('validating')
  })
}

const testStaleVersionConflict = (getRepository) => {
  it('throws conflict error when updating with stale version', async () => {
    const id = `contract-stale-version-${randomUUID()}`
    const summaryLog = buildSummaryLog(id, {
      status: 'preprocessing',
      file: buildPendingFile()
    })

    await getRepository().insert(summaryLog)
    const initial = await getRepository().findById(id)

    await getRepository().update(id, initial.version, {
      status: 'validating'
    })

    await expect(
      getRepository().update(id, initial.version, { status: 'rejected' })
    ).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 409 }
    })
  })
}

const testSequentialUpdates = (getRepository) => {
  it('allows sequential updates with correct versions', async () => {
    const id = `contract-sequential-updates-${randomUUID()}`
    const summaryLog = buildSummaryLog(id, {
      status: 'preprocessing',
      file: buildPendingFile()
    })

    await getRepository().insert(summaryLog)

    let current = await getRepository().findById(id)
    expect(current.version).toBe(1)

    await getRepository().update(id, current.version, {
      status: 'validating'
    })
    current = await getRepository().findById(id)
    expect(current.version).toBe(2)

    await getRepository().update(id, current.version, { status: 'validated' })
    current = await getRepository().findById(id)
    const expectedVersionAfterTwoUpdates = 3
    expect(current.version).toBe(expectedVersionAfterTwoUpdates)
    expect(current.status).toBe('validated')
  })
}

const testVersionIntegrity = (getRepository) => {
  it('preserves version field integrity across updates', async () => {
    const id = `contract-version-integrity-${randomUUID()}`
    const summaryLog = buildSummaryLog(id, {
      status: 'preprocessing',
      organisationId: 'org-123',
      registrationId: 'reg-456',
      file: buildPendingFile()
    })

    await getRepository().insert(summaryLog)
    const initial = await getRepository().findById(id)

    await getRepository().update(id, initial.version, {
      status: 'validating',
      file: buildFile({
        id: initial.file.id,
        name: initial.file.name
      })
    })

    const updated = await getRepository().findById(id)
    expect(updated.version).toBe(2)
    expect(updated.organisationId).toBe('org-123')
    expect(updated.registrationId).toBe('reg-456')
  })
}

const testConflictMessage = (getRepository) => {
  it('throws conflict with descriptive message for version mismatch', async () => {
    const id = `contract-conflict-message-${randomUUID()}`
    const summaryLog = buildSummaryLog(id, {
      status: 'preprocessing',
      file: buildPendingFile()
    })

    await getRepository().insert(summaryLog)
    const initial = await getRepository().findById(id)

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
      const id = `contract-concurrent-${randomUUID()}`
      const summaryLog = buildSummaryLog(id, {
        status: 'preprocessing',
        file: buildPendingFile()
      })

      await getRepository().insert(summaryLog)
      const current = await getRepository().findById(id)

      const results = await Promise.allSettled([
        getRepository().update(id, current.version, { status: 'validating' }),
        getRepository().update(id, current.version, { status: 'rejected' })
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
