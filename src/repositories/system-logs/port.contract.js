import { describe, expect } from 'vitest'
import { randomUUID } from 'crypto'

/** @import {SystemLogsRepository} from './port.js' */

const DEFAULT_LIMIT = 100

const buildSystemLog = ({
  organisationId,
  createdAt = new Date(),
  email = 'user@email.com',
  subCategory = 'test-sub-category',
  id
} = {}) => ({
  createdAt,
  createdBy: { id: 'user-001', email, scope: [] },
  event: {
    category: 'test-category',
    subCategory,
    action: 'test-action'
  },
  context: {
    ...(organisationId !== undefined && { organisationId }),
    ...(id !== undefined && { id })
  }
})

export const testSystemLogsRepositoryContract = (it) => {
  describe('find', () => {
    describe('filtering', () => {
      it('returns logs matching the provided email', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const email = `alice-${randomUUID()}@example.com`

        await repository.insert(buildSystemLog({ email, id: 1 }))
        await repository.insert(
          buildSystemLog({ email: `bob-${randomUUID()}@example.com`, id: 2 })
        )

        const result = await repository.find({
          email,
          limit: DEFAULT_LIMIT
        })

        expect(result.systemLogs).toHaveLength(1)
        expect(result.systemLogs[0].createdBy.email).toBe(email)
      })

      it('matches email case-insensitively', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const storedEmail = `Alice.Smith-${randomUUID()}@Example.COM`

        await repository.insert(buildSystemLog({ email: storedEmail, id: 1 }))

        const result = await repository.find({
          email: storedEmail.toLowerCase(),
          limit: DEFAULT_LIMIT
        })

        expect(result.systemLogs).toHaveLength(1)
        expect(result.systemLogs[0].createdBy.email).toBe(storedEmail)
      })

      it('returns logs matching the provided sub-category', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const subCategory = `Reconciliation-${randomUUID()}`

        await repository.insert(buildSystemLog({ subCategory, id: 1 }))
        await repository.insert(
          buildSystemLog({
            subCategory: `Organisations-${randomUUID()}`,
            id: 2
          })
        )

        const result = await repository.find({
          subCategory,
          limit: DEFAULT_LIMIT
        })

        expect(result.systemLogs).toHaveLength(1)
        expect(result.systemLogs[0].event.subCategory).toBe(subCategory)
      })

      it('returns logs matching the provided organisation ID', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const organisationId = randomUUID()

        await repository.insert(buildSystemLog({ organisationId, id: 1 }))
        await repository.insert(
          buildSystemLog({ organisationId: randomUUID(), id: 2 })
        )

        const result = await repository.find({
          organisationId,
          limit: DEFAULT_LIMIT
        })

        expect(result.systemLogs).toHaveLength(1)
        expect(result.systemLogs[0].context.organisationId).toBe(organisationId)
      })

      it('returns logs matching combined filters', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const organisationId = randomUUID()
        const email = `alice-${randomUUID()}@example.com`
        const subCategory = `Reconciliation-${randomUUID()}`

        await repository.insert(
          buildSystemLog({ organisationId, email, subCategory, id: 1 })
        )
        await repository.insert(
          buildSystemLog({
            organisationId,
            email: `bob-${randomUUID()}@example.com`,
            subCategory,
            id: 2
          })
        )
        await repository.insert(
          buildSystemLog({
            organisationId,
            email,
            subCategory: `Organisations-${randomUUID()}`,
            id: 3
          })
        )

        const result = await repository.find({
          organisationId,
          email,
          subCategory,
          limit: DEFAULT_LIMIT
        })

        expect(result.systemLogs).toHaveLength(1)
        expect(result.systemLogs[0].context.id).toBe(1)
      })

      it('returns empty result when no logs match', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const result = await repository.find({
          email: `nobody-${randomUUID()}@example.com`,
          limit: DEFAULT_LIMIT
        })

        expect(result.systemLogs).toEqual([])
        expect(result.hasMore).toBe(false)
        expect(result.nextCursor).toBeNull()
      })
    })

    describe('ordering', () => {
      it('returns logs newest first', async ({ systemLogsRepository }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const email = `alice-${randomUUID()}@example.com`

        await repository.insert(
          buildSystemLog({
            email,
            createdAt: new Date('2025-01-01'),
            id: 'older'
          })
        )
        await repository.insert(
          buildSystemLog({
            email,
            createdAt: new Date('2025-01-02'),
            id: 'newer'
          })
        )

        const result = await repository.find({
          email,
          limit: DEFAULT_LIMIT
        })

        expect(result.systemLogs[0].context.id).toBe('newer')
        expect(result.systemLogs[1].context.id).toBe('older')
      })
    })

    describe('pagination', () => {
      it('respects limit parameter', async ({ systemLogsRepository }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const email = `alice-${randomUUID()}@example.com`

        for (let i = 1; i <= 3; i++) {
          await repository.insert(buildSystemLog({ email, id: i }))
        }

        const result = await repository.find({ email, limit: 2 })

        expect(result.systemLogs).toHaveLength(2)
      })

      it('returns hasMore true when more items exist beyond limit', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const email = `alice-${randomUUID()}@example.com`

        for (let i = 1; i <= 3; i++) {
          await repository.insert(buildSystemLog({ email, id: i }))
        }

        const result = await repository.find({ email, limit: 2 })

        expect(result.hasMore).toBe(true)
        expect(result.nextCursor).not.toBeNull()
      })

      it('returns hasMore false when all items fit within limit', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const email = `alice-${randomUUID()}@example.com`

        await repository.insert(buildSystemLog({ email, id: 1 }))
        await repository.insert(buildSystemLog({ email, id: 2 }))

        const result = await repository.find({ email, limit: 10 })

        expect(result.systemLogs).toHaveLength(2)
        expect(result.hasMore).toBe(false)
        expect(result.nextCursor).toBeNull()
      })

      it('returns items after cursor when cursor is provided', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const email = `alice-${randomUUID()}@example.com`

        for (let i = 1; i <= 3; i++) {
          await repository.insert(buildSystemLog({ email, id: i }))
        }

        const page1 = await repository.find({ email, limit: 1 })

        expect(page1.systemLogs).toHaveLength(1)
        expect(page1.hasMore).toBe(true)

        const page2 = await repository.find({
          email,
          limit: 1,
          cursor: page1.nextCursor
        })

        expect(page2.systemLogs).toHaveLength(1)
        expect(page2.systemLogs[0].context.id).not.toBe(
          page1.systemLogs[0].context.id
        )
      })

      it('paginates through all results across multiple pages', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const email = `alice-${randomUUID()}@example.com`

        for (let i = 1; i <= 5; i++) {
          await repository.insert(buildSystemLog({ email, id: i }))
        }
        await repository.insert(
          buildSystemLog({ email: `bob-${randomUUID()}@example.com`, id: 99 })
        )

        const allIds = []
        let cursor

        do {
          const page = await repository.find({ email, limit: 2, cursor })

          allIds.push(...page.systemLogs.map((log) => log.context.id))
          cursor = page.nextCursor
        } while (cursor)

        expect(allIds).toHaveLength(5)
        expect(new Set(allIds).size).toBe(5)
      })

      it('does not include items from other filters in paginated results', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const targetEmail = `alice-${randomUUID()}@example.com`
        const otherEmail = `bob-${randomUUID()}@example.com`

        await repository.insert(buildSystemLog({ email: targetEmail, id: 1 }))
        await repository.insert(buildSystemLog({ email: otherEmail, id: 2 }))
        await repository.insert(buildSystemLog({ email: targetEmail, id: 3 }))
        await repository.insert(buildSystemLog({ email: otherEmail, id: 4 }))
        await repository.insert(buildSystemLog({ email: targetEmail, id: 5 }))

        const result = await repository.find({
          email: targetEmail,
          limit: 2
        })

        expect(result.systemLogs).toHaveLength(2)
        result.systemLogs.forEach((log) => {
          expect(log.createdBy.email).toBe(targetEmail)
        })

        expect(result.hasMore).toBe(true)

        const page2 = await repository.find({
          email: targetEmail,
          limit: 2,
          cursor: result.nextCursor
        })

        expect(page2.systemLogs).toHaveLength(1)
        expect(page2.systemLogs[0].createdBy.email).toBe(targetEmail)
        expect(page2.hasMore).toBe(false)
      })
    })
  })
}
