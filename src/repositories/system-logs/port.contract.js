import { describe, expect } from 'vitest'
import { randomUUID } from 'crypto'

import { buildSystemLog } from './contract/test-data.js'

/** @import {SystemLogsRepository} from './port.js' */

const DEFAULT_LIMIT = 100

export const testSystemLogsRepositoryContract = (it) => {
  describe('find', () => {
    describe('filtering', () => {
      it('returns logs matching the provided userId', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const userId = randomUUID()

        await repository.insert(buildSystemLog({ userId, id: 1 }))
        await repository.insert(buildSystemLog({ userId: randomUUID(), id: 2 }))

        const result = await repository.find({ userId, limit: DEFAULT_LIMIT })

        expect(result.systemLogs).toHaveLength(1)
        expect(result.systemLogs[0].createdBy.id).toBe(userId)
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
        const userId = randomUUID()
        const subCategory = `Reconciliation-${randomUUID()}`

        await repository.insert(
          buildSystemLog({ organisationId, userId, subCategory, id: 1 })
        )
        await repository.insert(
          buildSystemLog({
            organisationId,
            userId: randomUUID(),
            subCategory,
            id: 2
          })
        )
        await repository.insert(
          buildSystemLog({
            organisationId,
            userId,
            subCategory: `Organisations-${randomUUID()}`,
            id: 3
          })
        )

        const result = await repository.find({
          organisationId,
          userId,
          subCategory,
          limit: DEFAULT_LIMIT
        })

        expect(result.systemLogs).toHaveLength(1)
        expect(result.systemLogs[0].context.id).toBe(1)
      })

      it('returns an empty result when no logs match', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const result = await repository.find({
          userId: randomUUID(),
          limit: DEFAULT_LIMIT
        })

        expect(result.systemLogs).toEqual([])
        expect(result.hasNext).toBe(false)
        expect(result.hasPrev).toBe(false)
        expect(result.nextCursor).toBeNull()
        expect(result.prevCursor).toBeNull()
      })
    })

    describe('ordering', () => {
      it('returns logs newest first', async ({ systemLogsRepository }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const userId = randomUUID()

        await repository.insert(
          buildSystemLog({
            userId,
            createdAt: new Date('2025-01-01'),
            id: 'older'
          })
        )
        await repository.insert(
          buildSystemLog({
            userId,
            createdAt: new Date('2025-01-02'),
            id: 'newer'
          })
        )

        const result = await repository.find({ userId, limit: DEFAULT_LIMIT })

        expect(result.systemLogs[0].context.id).toBe('newer')
        expect(result.systemLogs[1].context.id).toBe('older')
      })
    })

    describe('forward pagination', () => {
      it('respects the limit parameter', async ({ systemLogsRepository }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const userId = randomUUID()

        for (let i = 1; i <= 3; i++) {
          await repository.insert(buildSystemLog({ userId, id: i }))
        }

        const result = await repository.find({ userId, limit: 2 })

        expect(result.systemLogs).toHaveLength(2)
      })

      it('returns hasNext true with a nextCursor when more items exist', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const userId = randomUUID()

        for (let i = 1; i <= 3; i++) {
          await repository.insert(buildSystemLog({ userId, id: i }))
        }

        const result = await repository.find({ userId, limit: 2 })

        expect(result.hasNext).toBe(true)
        expect(result.nextCursor).not.toBeNull()
      })

      it('returns hasNext false when all items fit within the limit', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const userId = randomUUID()

        await repository.insert(buildSystemLog({ userId, id: 1 }))
        await repository.insert(buildSystemLog({ userId, id: 2 }))

        const result = await repository.find({ userId, limit: 10 })

        expect(result.systemLogs).toHaveLength(2)
        expect(result.hasNext).toBe(false)
        expect(result.nextCursor).toBeNull()
      })

      it('reports hasPrev false on the first page', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const userId = randomUUID()

        for (let i = 1; i <= 3; i++) {
          await repository.insert(buildSystemLog({ userId, id: i }))
        }

        const result = await repository.find({ userId, limit: 2 })

        expect(result.hasPrev).toBe(false)
        expect(result.prevCursor).toBeNull()
      })

      it('returns the next page and reports hasPrev true when given a cursor', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const userId = randomUUID()

        for (let i = 1; i <= 3; i++) {
          await repository.insert(buildSystemLog({ userId, id: i }))
        }

        const page1 = await repository.find({ userId, limit: 1 })
        const page2 = await repository.find({
          userId,
          limit: 1,
          cursor: page1.nextCursor,
          direction: 'next'
        })

        expect(page2.systemLogs).toHaveLength(1)
        expect(page2.systemLogs[0].context.id).not.toBe(
          page1.systemLogs[0].context.id
        )
        expect(page2.hasPrev).toBe(true)
        expect(page2.prevCursor).not.toBeNull()
      })

      it('paginates forward through all results without duplicates', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const userId = randomUUID()

        for (let i = 1; i <= 5; i++) {
          await repository.insert(buildSystemLog({ userId, id: i }))
        }
        await repository.insert(
          buildSystemLog({ userId: randomUUID(), id: 99 })
        )

        const seen = []
        let cursor
        let hasNext = true

        while (hasNext) {
          const page = await repository.find({
            userId,
            limit: 2,
            cursor,
            direction: 'next'
          })
          seen.push(...page.systemLogs.map((log) => log.context.id))
          cursor = page.nextCursor
          hasNext = page.hasNext
        }

        expect(seen).toHaveLength(5)
        expect(new Set(seen).size).toBe(5)
        expect(seen).not.toContain(99)
      })
    })

    describe('backward pagination', () => {
      it('direction=prev returns the page immediately newer than the cursor', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const userId = randomUUID()

        for (let i = 1; i <= 5; i++) {
          await repository.insert(buildSystemLog({ userId, id: i }))
        }

        const page1 = await repository.find({ userId, limit: 2 })
        const page2 = await repository.find({
          userId,
          limit: 2,
          cursor: page1.nextCursor,
          direction: 'next'
        })
        const backToPage1 = await repository.find({
          userId,
          limit: 2,
          cursor: page2.prevCursor,
          direction: 'prev'
        })

        expect(backToPage1.systemLogs.map((log) => log.context.id)).toEqual(
          page1.systemLogs.map((log) => log.context.id)
        )
      })

      it('direction=prev always reports hasNext true', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const userId = randomUUID()

        for (let i = 1; i <= 3; i++) {
          await repository.insert(buildSystemLog({ userId, id: i }))
        }

        const page1 = await repository.find({ userId, limit: 1 })
        const page2 = await repository.find({
          userId,
          limit: 1,
          cursor: page1.nextCursor,
          direction: 'next'
        })
        const back = await repository.find({
          userId,
          limit: 1,
          cursor: page2.prevCursor,
          direction: 'prev'
        })

        expect(back.hasNext).toBe(true)
      })

      it('direction=prev reports hasPrev false when no older page exists', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const userId = randomUUID()

        for (let i = 1; i <= 4; i++) {
          await repository.insert(buildSystemLog({ userId, id: i }))
        }

        const page1 = await repository.find({ userId, limit: 2 })
        const page2 = await repository.find({
          userId,
          limit: 2,
          cursor: page1.nextCursor,
          direction: 'next'
        })
        const backToPage1 = await repository.find({
          userId,
          limit: 2,
          cursor: page2.prevCursor,
          direction: 'prev'
        })

        expect(backToPage1.hasPrev).toBe(false)
      })

      it('direction=prev returns the page nearest the cursor when more newer rows exist', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const userId = randomUUID()

        for (let i = 1; i <= 6; i++) {
          await repository.insert(buildSystemLog({ userId, id: i }))
        }

        const page1 = await repository.find({ userId, limit: 2 })
        const page2 = await repository.find({
          userId,
          limit: 2,
          cursor: page1.nextCursor,
          direction: 'next'
        })
        const page3 = await repository.find({
          userId,
          limit: 2,
          cursor: page2.nextCursor,
          direction: 'next'
        })
        const backToPage2 = await repository.find({
          userId,
          limit: 2,
          cursor: page3.prevCursor,
          direction: 'prev'
        })

        expect(backToPage2.systemLogs.map((log) => log.context.id)).toEqual(
          page2.systemLogs.map((log) => log.context.id)
        )
        expect(backToPage2.hasPrev).toBe(true)
        expect(backToPage2.hasNext).toBe(true)
      })

      it('direction=prev returns an empty result with hasNext false when nothing is newer', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const userId = randomUUID()

        for (let i = 1; i <= 3; i++) {
          await repository.insert(buildSystemLog({ userId, id: i }))
        }

        const newestPage = await repository.find({ userId, limit: 1 })
        const result = await repository.find({
          userId,
          limit: 10,
          cursor: newestPage.nextCursor,
          direction: 'prev'
        })

        expect(result.systemLogs).toEqual([])
        expect(result.hasNext).toBe(false)
        expect(result.hasPrev).toBe(false)
        expect(result.nextCursor).toBeNull()
        expect(result.prevCursor).toBeNull()
      })
    })
  })
}
