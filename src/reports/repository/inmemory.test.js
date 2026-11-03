import { describe, expect, it as base } from 'vitest'
import { createInMemoryReportsRepository } from './inmemory.js'
import { testReportsRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  reports: async ({}, use) => {
    await use(new Map())
  },
  reportsRepository: async (/** @type {*} */ { reports }, use) => {
    await use(createInMemoryReportsRepository(reports))
  },
  storeAccreditationNumber: async (/** @type {*} */ { reports }, use) => {
    await use(async (reportId, accreditationNumber) => {
      reports.set(reportId, { ...reports.get(reportId), accreditationNumber })
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
