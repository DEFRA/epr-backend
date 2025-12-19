import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { summaryLogFactory } from './test-data.js'
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

        await repository.insert(id, summaryLogFactory.validating({ expiresAt }))
        const found = await repository.findById(id)

        expect(found.summaryLog.expiresAt).toEqual(expiresAt)
      })

      it('stores and retrieves expiresAt as null', async () => {
        const id = `contract-expires-at-null-${randomUUID()}`

        await repository.insert(id, summaryLogFactory.submitted())
        const found = await repository.findById(id)

        expect(found.summaryLog.expiresAt).toBeNull()
      })

      it('rejects insert without expiresAt', async () => {
        const id = `contract-expires-at-omitted-${randomUUID()}`
        const { expiresAt: _, ...summaryLogWithoutExpiresAt } =
          summaryLogFactory.validating()

        await expect(
          repository.insert(id, summaryLogWithoutExpiresAt)
        ).rejects.toThrow(/Invalid summary log data.*expiresAt/)
      })
    })

    describe('update', () => {
      it('updates status and expiresAt together', async () => {
        const id = `contract-update-status-expires-at-${randomUUID()}`
        const newExpiresAt = new Date('2024-12-26T12:00:00.000Z')

        await repository.insert(id, summaryLogFactory.validating())
        const current = await repository.findById(id)

        await repository.update(id, current.version, {
          status: SUMMARY_LOG_STATUS.VALIDATED,
          expiresAt: newExpiresAt
        })

        const found = await waitForVersion(repository, id, current.version + 1)
        expect(found.summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
        expect(found.summaryLog.expiresAt).toEqual(newExpiresAt)
      })

      it('updates status and expiresAt to null together', async () => {
        const id = `contract-update-expires-at-null-${randomUUID()}`

        await repository.insert(id, summaryLogFactory.submitting())
        const current = await repository.findById(id)

        await repository.update(id, current.version, {
          status: SUMMARY_LOG_STATUS.SUBMITTED,
          expiresAt: null
        })

        const found = await waitForVersion(repository, id, current.version + 1)
        expect(found.summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
        expect(found.summaryLog.expiresAt).toBeNull()
      })

      it('preserves expiresAt when updating other fields', async () => {
        const id = `contract-preserve-expires-at-${randomUUID()}`
        const expiresAt = new Date('2024-12-26T12:00:00.000Z')

        await repository.insert(id, summaryLogFactory.validating({ expiresAt }))
        const current = await repository.findById(id)

        await repository.update(id, current.version, {
          organisationId: 'updated-org'
        })

        const found = await waitForVersion(repository, id, current.version + 1)
        expect(found.summaryLog.expiresAt).toEqual(expiresAt)
      })

      it('rejects update with status but without expiresAt', async () => {
        const id = `contract-status-without-expires-at-${randomUUID()}`

        await repository.insert(id, summaryLogFactory.validating())
        const current = await repository.findById(id)

        await expect(
          repository.update(id, current.version, {
            status: SUMMARY_LOG_STATUS.VALIDATED
          })
        ).rejects.toThrow(/status and expiresAt must be updated together/)
      })

      it('rejects update with expiresAt but without status', async () => {
        const id = `contract-expires-at-without-status-${randomUUID()}`

        await repository.insert(id, summaryLogFactory.validating())
        const current = await repository.findById(id)

        await expect(
          repository.update(id, current.version, {
            expiresAt: new Date('2024-12-26T12:00:00.000Z')
          })
        ).rejects.toThrow(/status and expiresAt must be updated together/)
      })
    })
  })
}
