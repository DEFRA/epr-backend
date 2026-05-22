import { describe, it as base, expect, it } from 'vitest'
import { createInMemoryWasteBalancesRepository } from './inmemory.js'
import { createInMemoryStreamRepository } from './stream-inmemory.js'
import { testWasteBalancesRepositoryContract } from './port.contract.js'

const extendedIt = base.extend({
  // eslint-disable-next-line no-empty-pattern
  wasteBalanceStorage: async ({}, use) => {
    const storage = []
    await use(storage)
  },
  // eslint-disable-next-line no-empty-pattern
  streamRepository: async ({}, use) => {
    const repository = createInMemoryStreamRepository()()
    await use(repository)
  },
  wasteBalancesRepository: async (
    // @ts-expect-error -- vitest .extend() fixture typing
    { wasteBalanceStorage, streamRepository },
    use
  ) => {
    const factory = createInMemoryWasteBalancesRepository(wasteBalanceStorage, {
      streamRepository
    })
    await use(factory)
  },
  insertWasteBalance: async (
    // @ts-expect-error -- vitest .extend() fixture typing
    { wasteBalanceStorage },
    use
  ) => {
    await use(async (wasteBalance) => {
      wasteBalanceStorage.push(wasteBalance)
    })
  },
  insertWasteBalances: async (
    // @ts-expect-error -- vitest .extend() fixture typing
    { wasteBalanceStorage },
    use
  ) => {
    await use(async (wasteBalances) => {
      wasteBalanceStorage.push(...wasteBalances)
    })
  }
})

describe('waste-balances repository - in-memory implementation', () => {
  it('should create repository instance', () => {
    const repository = createInMemoryWasteBalancesRepository([], {
      streamRepository: createInMemoryStreamRepository()()
    })
    const instance = repository()
    expect(instance).toBeDefined()
    expect(instance.findByAccreditationId).toBeTypeOf('function')
  })

  it('should expose internal storage for testing', () => {
    const initialStorage = [{ accreditationId: 'acc-1' }]
    const repository = createInMemoryWasteBalancesRepository(initialStorage, {
      streamRepository: createInMemoryStreamRepository()()
    })()
    // @ts-expect-error -- _getStorageForTesting is a test-only private method not on the port type
    expect(repository._getStorageForTesting()).toBe(initialStorage)
  })

  testWasteBalancesRepositoryContract(extendedIt)
})
