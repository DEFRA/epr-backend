import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { ObjectId } from 'mongodb'
import { it as base, describe, expect, vi } from 'vitest'
import {
  buildAwaitingAuthorisationPrn,
  buildCancelledPrn
} from './contract/test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from './inmemory.plugin.js'
import { testPackagingRecyclingNotesRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  prnRepositoryFactory: async ({}, use) => {
    const factory = createInMemoryPackagingRecyclingNotesRepository([])
    await use(factory)
  },

  prnRepository: async ({ prnRepositoryFactory }, use) => {
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    }
    const repository = prnRepositoryFactory(mockLogger)
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

describe('in-memory adapter legacy documents without a version field', () => {
  const buildVersionlessSeed = () => {
    const id = new ObjectId().toHexString()
    const { version: _version, ...prnWithoutVersion } =
      buildAwaitingAuthorisationPrn()
    return { id, prn: { ...prnWithoutVersion, id } }
  }

  base('reads back as version 1', async () => {
    const { id, prn } = buildVersionlessSeed()
    const repository = createInMemoryPackagingRecyclingNotesRepository([prn])({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    })

    const found = await repository.findById(id)

    expect(found.version).toBe(1)
  })

  base(
    'accepts a CAS update with version 1 and bumps to version 2',
    async () => {
      const { id, prn } = buildVersionlessSeed()
      const repository = createInMemoryPackagingRecyclingNotesRepository([prn])(
        {
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn()
        }
      )

      const updated = await repository.updateStatus({
        id,
        version: 1,
        status: PRN_STATUS.AWAITING_ACCEPTANCE,
        updatedBy: { id: 'user-issuer', name: 'Issuer User' },
        updatedAt: new Date(),
        prnNumber: `TT2688888`
      })

      expect(updated.version).toBe(2)
      expect(updated.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
    }
  )
})
