import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { it as base, describe, expect } from 'vitest'
import { buildCancelledPrn } from './contract/test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from './inmemory.plugin.js'
import { testPackagingRecyclingNotesRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  prnRepository: async ({}, use) => {
    const factory = createInMemoryPackagingRecyclingNotesRepository([])
    const repository = factory()
    await use(repository)
  }
})

describe('In-memory packaging recycling notes repository', () => {
  testPackagingRecyclingNotesRepositoryContract(it)
})

describe('in-memory adapter organisation exclusion', () => {
  base(
    'should exclude PRNs belonging to excluded organisation ids',
    async () => {
      const testOrgId = `test-org-${Date.now()}-${Math.random()}`
      const realOrgId = `real-org-${Date.now()}-${Math.random()}`

      const repository = createInMemoryPackagingRecyclingNotesRepository(
        [],
        [testOrgId]
      )()

      const testPrn = await repository.create(
        buildCancelledPrn({
          prnNumber: `IME-OE-TEST-${Date.now()}-${Math.random()}`,
          organisation: { id: testOrgId, name: 'Test Org', tradingName: 'Test' }
        })
      )
      const realPrn = await repository.create(
        buildCancelledPrn({
          prnNumber: `IME-OE-REAL-${Date.now()}-${Math.random()}`,
          organisation: { id: realOrgId, name: 'Real Org', tradingName: 'Real' }
        })
      )

      const result = await repository.findByStatus({
        statuses: [PRN_STATUS.CANCELLED],
        limit: 200
      })

      const ids = result.items.map((p) => p.id)
      expect(ids).toContain(realPrn.id)
      expect(ids).not.toContain(testPrn.id)
    }
  )

  base(
    'should return all items when excludeOrganisationIds is empty',
    async () => {
      const orgId = `org-all-${Date.now()}-${Math.random()}`

      const repository = createInMemoryPackagingRecyclingNotesRepository(
        [],
        []
      )()

      const prn = await repository.create(
        buildCancelledPrn({
          prnNumber: `IME-OE-ALL-${Date.now()}-${Math.random()}`,
          organisation: { id: orgId, name: 'Some Org', tradingName: 'Some' }
        })
      )

      const result = await repository.findByStatus({
        statuses: [PRN_STATUS.CANCELLED],
        limit: 200
      })

      expect(result.items.map((p) => p.id)).toContain(prn.id)
    }
  )

  base(
    'should derive hasMore and nextCursor from the filtered universe',
    async () => {
      const testOrgId = `test-org-hm-${Date.now()}-${Math.random()}`

      const repository = createInMemoryPackagingRecyclingNotesRepository(
        [],
        [testOrgId]
      )()

      const sentinel = await repository.create(
        buildCancelledPrn({
          prnNumber: `IME-OE-S-${Date.now()}-${Math.random()}`
        })
      )
      const realPrn1 = await repository.create(
        buildCancelledPrn({
          prnNumber: `IME-OE-R1-${Date.now()}-${Math.random()}`,
          organisation: {
            id: `real-org-hm-1-${Date.now()}`,
            name: 'Real Org 1',
            tradingName: 'Real 1'
          }
        })
      )
      const realPrn2 = await repository.create(
        buildCancelledPrn({
          prnNumber: `IME-OE-R2-${Date.now()}-${Math.random()}`,
          organisation: {
            id: `real-org-hm-2-${Date.now()}`,
            name: 'Real Org 2',
            tradingName: 'Real 2'
          }
        })
      )
      await repository.create(
        buildCancelledPrn({
          prnNumber: `IME-OE-T1-${Date.now()}-${Math.random()}`,
          organisation: { id: testOrgId, name: 'Test Org', tradingName: 'Test' }
        })
      )

      const result = await repository.findByStatus({
        statuses: [PRN_STATUS.CANCELLED],
        cursor: sentinel.id,
        limit: 1
      })

      expect(result.items).toHaveLength(1)
      expect(result.items[0].id).toBe(realPrn1.id)
      expect(result.hasMore).toBe(true)
      expect(result.nextCursor).toBe(realPrn1.id)
      expect(result.items.map((p) => p.id)).not.toContain(realPrn2.id)
    }
  )
})
