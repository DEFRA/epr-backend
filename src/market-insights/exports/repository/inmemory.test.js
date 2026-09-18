import { it as base } from 'vitest'
import { createInMemoryMarketInsightsExportsRepository } from './inmemory.js'
import { testMarketInsightsExportsRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  marketInsightsExportsRepository: async ({}, use) => {
    await use(createInMemoryMarketInsightsExportsRepository()())
  }
})

describe('In-memory market insights exports repository', () => {
  testMarketInsightsExportsRepositoryContract(it)
})
