import { describe, expect } from 'vitest'
import { randomUUID } from 'crypto'

import { buildSystemLog } from './contract/test-data.js'

/** @import {SystemLogsRepository} from './port.js' */

const DEFAULT_LIMIT = 100

export const testSystemLogsRepositoryContract = (it) => {
  describe('filtering', () => {
    it('returns system logs matching the provided organisation id', async ({
      systemLogsRepository
    }) => {
      /** @type {SystemLogsRepository} */
      const repository = systemLogsRepository()

      const organisationId1 = randomUUID()
      const organisationId2 = randomUUID()

      await repository.insert(
        buildSystemLog({ organisationId: organisationId1, id: 1 })
      )
      await repository.insert(
        buildSystemLog({ organisationId: organisationId2, id: 2 })
      )
      await repository.insert(
        buildSystemLog({ organisationId: organisationId1, id: 3 })
      )

      const result = await repository.findByOrganisationId({
        organisationId: organisationId1,
        limit: DEFAULT_LIMIT
      })

      expect(result.systemLogs).toHaveLength(2)
      const ids = result.systemLogs.map((log) => log.context.id)
      expect(ids).toContain(1)
      expect(ids).toContain(3)
    })

    it('does not return system logs without an organisation id', async ({
      systemLogsRepository
    }) => {
      /** @type {SystemLogsRepository} */
      const repository = systemLogsRepository()

      const organisationId = randomUUID()

      await repository.insert(buildSystemLog({ organisationId, id: 1 }))
      await repository.insert(buildSystemLog({ id: 2 }))

      const result = await repository.findByOrganisationId({
        organisationId,
        limit: DEFAULT_LIMIT
      })

      expect(result.systemLogs).toHaveLength(1)
    })

    it('returns empty result when no system logs match', async ({
      systemLogsRepository
    }) => {
      /** @type {SystemLogsRepository} */
      const repository = systemLogsRepository()

      const result = await repository.findByOrganisationId({
        organisationId: randomUUID(),
        limit: DEFAULT_LIMIT
      })

      expect(result.systemLogs).toEqual([])
      expect(result.hasMore).toBe(false)
      expect(result.nextCursor).toBeNull()
    })
  })

  describe('ordering', () => {
    it('returns system logs newest first', async ({ systemLogsRepository }) => {
      /** @type {SystemLogsRepository} */
      const repository = systemLogsRepository()

      const organisationId = randomUUID()

      await repository.insert(
        buildSystemLog({
          organisationId,
          createdAt: new Date('2025-01-01'),
          id: 'older'
        })
      )
      await repository.insert(
        buildSystemLog({
          organisationId,
          createdAt: new Date('2025-01-02'),
          id: 'newer'
        })
      )

      const result = await repository.findByOrganisationId({
        organisationId,
        limit: DEFAULT_LIMIT
      })

      expect(result.systemLogs).toHaveLength(2)
      expect(result.systemLogs[0].context.id).toBe('newer')
      expect(result.systemLogs[1].context.id).toBe('older')
    })
  })

  describe('pagination', () => {
    it('respects limit parameter', async ({ systemLogsRepository }) => {
      /** @type {SystemLogsRepository} */
      const repository = systemLogsRepository()

      const organisationId = randomUUID()

      await repository.insert(buildSystemLog({ organisationId, id: 1 }))
      await repository.insert(buildSystemLog({ organisationId, id: 2 }))
      await repository.insert(buildSystemLog({ organisationId, id: 3 }))

      const result = await repository.findByOrganisationId({
        organisationId,
        limit: 2
      })

      expect(result.systemLogs).toHaveLength(2)
    })

    it('returns hasMore true when more items exist beyond limit', async ({
      systemLogsRepository
    }) => {
      /** @type {SystemLogsRepository} */
      const repository = systemLogsRepository()

      const organisationId = randomUUID()

      await repository.insert(buildSystemLog({ organisationId, id: 1 }))
      await repository.insert(buildSystemLog({ organisationId, id: 2 }))
      await repository.insert(buildSystemLog({ organisationId, id: 3 }))

      const result = await repository.findByOrganisationId({
        organisationId,
        limit: 2
      })

      expect(result.hasMore).toBe(true)
      expect(result.nextCursor).not.toBeNull()
    })

    it('returns hasMore false when all items fit within limit', async ({
      systemLogsRepository
    }) => {
      /** @type {SystemLogsRepository} */
      const repository = systemLogsRepository()

      const organisationId = randomUUID()

      await repository.insert(buildSystemLog({ organisationId, id: 1 }))
      await repository.insert(buildSystemLog({ organisationId, id: 2 }))

      const result = await repository.findByOrganisationId({
        organisationId,
        limit: 10
      })

      expect(result.systemLogs).toHaveLength(2)
      expect(result.hasMore).toBe(false)
      expect(result.nextCursor).toBeNull()
    })

    it('returns items after cursor when cursor is provided', async ({
      systemLogsRepository
    }) => {
      /** @type {SystemLogsRepository} */
      const repository = systemLogsRepository()

      const organisationId = randomUUID()

      await repository.insert(buildSystemLog({ organisationId, id: 1 }))
      await repository.insert(buildSystemLog({ organisationId, id: 2 }))
      await repository.insert(buildSystemLog({ organisationId, id: 3 }))

      const page1 = await repository.findByOrganisationId({
        organisationId,
        limit: 1
      })

      expect(page1.systemLogs).toHaveLength(1)
      expect(page1.hasMore).toBe(true)

      const page2 = await repository.findByOrganisationId({
        organisationId,
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

      const organisationId = randomUUID()

      for (let i = 1; i <= 5; i++) {
        await repository.insert(buildSystemLog({ organisationId, id: i }))
      }

      const allIds = []
      let cursor
      let pageCount = 0

      do {
        const page = await repository.findByOrganisationId({
          organisationId,
          limit: 2,
          cursor
        })

        allIds.push(...page.systemLogs.map((log) => log.context.id))
        cursor = page.nextCursor
        pageCount++

        if (cursor) {
          expect(page.hasMore).toBe(true)
          expect(page.systemLogs).toHaveLength(2)
        } else {
          expect(page.hasMore).toBe(false)
          expect(page.systemLogs).toHaveLength(1)
        }
      } while (cursor)

      expect(pageCount).toBe(3)
      expect(allIds).toHaveLength(5)
      expect(new Set(allIds).size).toBe(5)
    })

    it('does not include items from other organisations in paginated results', async ({
      systemLogsRepository
    }) => {
      /** @type {SystemLogsRepository} */
      const repository = systemLogsRepository()

      const targetOrg = randomUUID()
      const otherOrg = randomUUID()

      await repository.insert(
        buildSystemLog({ organisationId: targetOrg, id: 1 })
      )
      await repository.insert(
        buildSystemLog({ organisationId: otherOrg, id: 2 })
      )
      await repository.insert(
        buildSystemLog({ organisationId: targetOrg, id: 3 })
      )
      await repository.insert(
        buildSystemLog({ organisationId: otherOrg, id: 4 })
      )
      await repository.insert(
        buildSystemLog({ organisationId: targetOrg, id: 5 })
      )

      const result = await repository.findByOrganisationId({
        organisationId: targetOrg,
        limit: 2
      })

      expect(result.systemLogs).toHaveLength(2)
      result.systemLogs.forEach((log) => {
        expect(log.context.organisationId).toBe(targetOrg)
      })

      expect(result.hasMore).toBe(true)

      const page2 = await repository.findByOrganisationId({
        organisationId: targetOrg,
        limit: 2,
        cursor: result.nextCursor
      })

      expect(page2.systemLogs).toHaveLength(1)
      expect(page2.systemLogs[0].context.organisationId).toBe(targetOrg)
      expect(page2.hasMore).toBe(false)
    })
  })

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
      it('paginates through filtered results', async ({
        systemLogsRepository
      }) => {
        /** @type {SystemLogsRepository} */
        const repository = systemLogsRepository()

        const email = `alice-${randomUUID()}@example.com`

        for (let i = 1; i <= 3; i++) {
          await repository.insert(buildSystemLog({ email, id: i }))
        }
        await repository.insert(
          buildSystemLog({ email: `bob-${randomUUID()}@example.com`, id: 99 })
        )

        const page1 = await repository.find({ email, limit: 2 })

        expect(page1.systemLogs).toHaveLength(2)
        expect(page1.hasMore).toBe(true)

        const page2 = await repository.find({
          email,
          limit: 2,
          cursor: page1.nextCursor
        })

        expect(page2.systemLogs).toHaveLength(1)
        expect(page2.hasMore).toBe(false)
        expect(page2.nextCursor).toBeNull()
      })
    })
  })
}
