import { describe, it as base, expect, it } from 'vitest'

import { createInMemoryStreamRepository } from './stream-inmemory.js'
import { testStreamRepositoryContract } from './stream-port.contract.js'

const extendedIt = base.extend({
  // eslint-disable-next-line no-empty-pattern
  streamStorage: async ({}, use) => {
    const storage = []
    await use(storage)
  },
  streamRepository: async (/** @type {*} */ { streamStorage }, use) => {
    const factory = createInMemoryStreamRepository(streamStorage)
    await use(factory)
  }
})

describe('waste-balances stream repository - in-memory implementation', () => {
  it('exposes the stream port surface', () => {
    const repository = createInMemoryStreamRepository()()
    expect(repository.appendEvent).toBeTypeOf('function')
    expect(repository.findLatestByPartition).toBeTypeOf('function')
    expect(repository.findLatestByPartitionAndKind).toBeTypeOf('function')
    expect(repository.findEventsByPrnIdAfter).toBeTypeOf('function')
  })

  testStreamRepositoryContract(extendedIt)
})
