import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildSummaryLog } from './test-data.js'
import { waitForVersion } from './test-helpers.js'

export const testExpiresAtBehaviour = (it) => {
  describe('expiresAt field', () => {
    let repository

    beforeEach(async ({ summaryLogsRepository }) => {
      repository = summaryLogsRepository
    })

    describe('insert', () => {
      it('stores and retrieves expiresAt as a Date', async () => {
        const id = `contract-expires-at-date-${randomUUID()}`
        const expiresAt = new Date('2024-12-26T12:00:00.000Z')
        const summaryLog = buildSummaryLog({ expiresAt })

        await repository.insert(id, summaryLog)
        const found = await repository.findById(id)

        expect(found.summaryLog.expiresAt).toEqual(expiresAt)
      })

      it('stores and retrieves expiresAt as null', async () => {
        const id = `contract-expires-at-null-${randomUUID()}`
        const summaryLog = buildSummaryLog({ expiresAt: null })

        await repository.insert(id, summaryLog)
        const found = await repository.findById(id)

        expect(found.summaryLog.expiresAt).toBeNull()
      })

      it('allows insert without expiresAt', async () => {
        const id = `contract-expires-at-omitted-${randomUUID()}`
        const summaryLog = buildSummaryLog()

        await repository.insert(id, summaryLog)
        const found = await repository.findById(id)

        expect(found.summaryLog.expiresAt).toBeUndefined()
      })
    })

    describe('update', () => {
      it('updates expiresAt to a Date', async () => {
        const id = `contract-update-expires-at-${randomUUID()}`
        const summaryLog = buildSummaryLog()
        const newExpiresAt = new Date('2024-12-26T12:00:00.000Z')

        await repository.insert(id, summaryLog)
        const current = await repository.findById(id)

        await repository.update(id, current.version, {
          expiresAt: newExpiresAt
        })

        const found = await waitForVersion(repository, id, current.version + 1)
        expect(found.summaryLog.expiresAt).toEqual(newExpiresAt)
      })

      it('updates expiresAt to null', async () => {
        const id = `contract-update-expires-at-null-${randomUUID()}`
        const expiresAt = new Date('2024-12-26T12:00:00.000Z')
        const summaryLog = buildSummaryLog({ expiresAt })

        await repository.insert(id, summaryLog)
        const current = await repository.findById(id)

        await repository.update(id, current.version, { expiresAt: null })

        const found = await waitForVersion(repository, id, current.version + 1)
        expect(found.summaryLog.expiresAt).toBeNull()
      })

      it('preserves expiresAt when not included in update', async () => {
        const id = `contract-preserve-expires-at-${randomUUID()}`
        const expiresAt = new Date('2024-12-26T12:00:00.000Z')
        const summaryLog = buildSummaryLog({ expiresAt })

        await repository.insert(id, summaryLog)
        const current = await repository.findById(id)

        await repository.update(id, current.version, { status: 'validating' })

        const found = await waitForVersion(repository, id, current.version + 1)
        expect(found.summaryLog.expiresAt).toEqual(expiresAt)
      })
    })
  })
}
