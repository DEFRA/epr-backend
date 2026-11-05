import { describe, expect, it as base } from 'vitest'
import { createInMemoryReportsRepository } from './inmemory.js'
import { testReportsRepositoryContract } from './port.contract.js'

const withStore =
  /** @type {import('vitest').TestAPI<{ reportsStore: Map<string, Object> }>} */ (
    base.extend({
      // eslint-disable-next-line no-empty-pattern
      reportsStore: async ({}, use) => {
        await use(new Map())
      }
    })
  )

const it = withStore.extend({
  reportsRepository: async ({ reportsStore }, use) => {
    await use(createInMemoryReportsRepository(reportsStore))
  },
  forgetAccreditationNumber: async ({ reportsStore }, use) => {
    await use(async (/** @type {string} */ reportId) => {
      const { accreditationNumber: _forgotten, ...report } =
        reportsStore.get(reportId)
      reportsStore.set(reportId, report)
    })
  }
})

describe('In-memory reports repository', () => {
  it('creates a repository', ({ reportsRepository }) => {
    expect(reportsRepository).toBeDefined()
  })

  describe('reports repository contract', () => {
    testReportsRepositoryContract(it)
  })
})
