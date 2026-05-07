import { describe, it as base, expect, it } from 'vitest'
import { createInMemoryWasteBalancesRepository } from './inmemory.js'
import { createInMemoryLedgerRepository } from './ledger-inmemory.js'
import { testWasteBalancesRepositoryContract } from './port.contract.js'

const extendedIt = base.extend({
  // eslint-disable-next-line no-empty-pattern
  wasteBalanceStorage: async ({}, use) => {
    const storage = []
    await use(storage)
  },
  // eslint-disable-next-line no-empty-pattern
  ledgerStorage: async ({}, use) => {
    const storage = []
    await use(storage)
  },
  ledgerRepository: async ({ ledgerStorage }, use) => {
    const repository = createInMemoryLedgerRepository(ledgerStorage)()
    await use(repository)
  },
  wasteBalancesRepository: async (
    { wasteBalanceStorage, ledgerRepository },
    use
  ) => {
    const factory = createInMemoryWasteBalancesRepository(wasteBalanceStorage, {
      ledgerRepository
    })
    await use(factory)
  },
  ledgerEnabledWasteBalancesRepository: async (
    { wasteBalanceStorage, ledgerRepository },
    use
  ) => {
    const factory = createInMemoryWasteBalancesRepository(wasteBalanceStorage, {
      ledgerRepository,
      featureFlags: { isWasteBalanceLedgerEnabled: () => true }
    })
    await use(factory)
  },
  insertWasteBalance: async ({ wasteBalanceStorage }, use) => {
    await use(async (wasteBalance) => {
      wasteBalanceStorage.push(wasteBalance)
    })
  },
  insertWasteBalances: async ({ wasteBalanceStorage }, use) => {
    await use(async (wasteBalances) => {
      wasteBalanceStorage.push(...wasteBalances)
    })
  }
})

describe('waste-balances repository - in-memory implementation', () => {
  it('should create repository instance', () => {
    const repository = createInMemoryWasteBalancesRepository([], {
      ledgerRepository: createInMemoryLedgerRepository()()
    })
    const instance = repository()
    expect(instance).toBeDefined()
    expect(instance.findByAccreditationId).toBeTypeOf('function')
  })

  it('should expose internal storage for testing', () => {
    const initialStorage = [{ accreditationId: 'acc-1' }]
    const repository = createInMemoryWasteBalancesRepository(initialStorage, {
      ledgerRepository: createInMemoryLedgerRepository()()
    })()
    expect(repository._getStorageForTesting()).toBe(initialStorage)
  })

  testWasteBalancesRepositoryContract(extendedIt)
})
