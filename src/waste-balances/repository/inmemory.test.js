import { describe, it as base, expect, it } from 'vitest'
import { createWasteBalancesRepository } from './repository.js'
import { createInMemoryStreamRepository } from './stream-inmemory.js'
import { createInMemoryRowStateRepository } from '#repositories/waste-records/states/inmemory.js'
import { buildStreamEvent } from './stream-test-data.js'
import { testWasteBalancesRepositoryContract } from './port.contract.js'

const extendedIt = base.extend({
  // eslint-disable-next-line no-empty-pattern
  streamRepository: async ({}, use) => {
    const repository = createInMemoryStreamRepository()()
    await use(repository)
  },
  // eslint-disable-next-line no-empty-pattern
  rowStateRepository: async ({}, use) => {
    const repository = createInMemoryRowStateRepository()()
    await use(repository)
  },
  wasteBalancesRepository: async (
    // @ts-expect-error -- vitest .extend() fixture typing
    { streamRepository, rowStateRepository },
    use
  ) => {
    const factory = createWasteBalancesRepository({
      streamRepository,
      rowStateRepository
    })
    await use(factory)
  },
  seedBalance: async (
    // @ts-expect-error -- vitest .extend() fixture typing
    { streamRepository },
    use
  ) => {
    await use(async (event) => {
      await streamRepository.appendEvent(buildStreamEvent(event))
    })
  }
})

describe('waste-balances repository - in-memory implementation', () => {
  it('should create repository instance', () => {
    const repository = createWasteBalancesRepository({
      streamRepository: createInMemoryStreamRepository()()
    })
    const instance = repository()
    expect(instance).toBeDefined()
    expect(instance.findBalance).toBeTypeOf('function')
  })

  testWasteBalancesRepositoryContract(extendedIt)
})
