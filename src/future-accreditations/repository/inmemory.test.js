import { describe, it as base } from 'vitest'

import { createInMemoryFutureAccreditationsRepository } from './inmemory.js'
import { testFutureAccreditationsRepositoryContract } from './port.contract.js'

/** @import { FutureAccreditationsContractIt } from './port.contract.js' */

const it = /** @type {FutureAccreditationsContractIt} */ (
  base.extend({
    // eslint-disable-next-line no-empty-pattern
    futureAccreditationsRepository: async ({}, use) => {
      await use(createInMemoryFutureAccreditationsRepository()())
    }
  })
)

describe('in-memory future accreditations repository', () => {
  testFutureAccreditationsRepositoryContract(it)
})
