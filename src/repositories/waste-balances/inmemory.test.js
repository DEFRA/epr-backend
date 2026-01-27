import Hapi from '@hapi/hapi'
import { describe, it as base, expect, it, vi } from 'vitest'
import { createInMemoryWasteBalancesRepository } from './inmemory.js'
import { testWasteBalancesRepositoryContract } from './port.contract.js'
import { createInMemoryWasteBalancesRepositoryPlugin } from '#plugins/repositories/inmemory-waste-balances-repository-plugin.js'

const extendedIt = base.extend({
  // eslint-disable-next-line no-empty-pattern
  wasteBalanceStorage: async ({}, use) => {
    const storage = []
    await use(storage)
  },
  // eslint-disable-next-line no-empty-pattern
  organisationsRepository: async ({}, use) => {
    const mock = {
      findAccreditationById: vi.fn()
    }
    await use(mock)
  },
  wasteBalancesRepository: async (
    { wasteBalanceStorage, organisationsRepository },
    use
  ) => {
    const factory = createInMemoryWasteBalancesRepository(wasteBalanceStorage, {
      organisationsRepository
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
    const repository = createInMemoryWasteBalancesRepository()
    const instance = repository()
    expect(instance).toBeDefined()
    expect(instance.findByAccreditationId).toBeTypeOf('function')
  })

  it('should throw error when organisationsRepository dependency is missing', async () => {
    const repository = createInMemoryWasteBalancesRepository([], {})()
    const record = { organisationId: 'org-1' }
    await expect(
      repository.updateWasteBalanceTransactions([record], 'acc-1')
    ).rejects.toThrow('organisationsRepository dependency is required')
  })

  it('should expose internal storage for testing', () => {
    const initialStorage = [{ accreditationId: 'acc-1' }]
    const repository = createInMemoryWasteBalancesRepository(initialStorage)()
    expect(repository._getStorageForTesting()).toBe(initialStorage)
  })

  testWasteBalancesRepositoryContract(extendedIt)

  describe('plugin wiring', () => {
    it('makes repository available on request via plugin', async () => {
      const server = Hapi.server()
      const { plugin } = createInMemoryWasteBalancesRepositoryPlugin()
      await server.register(plugin)

      server.route({
        method: 'GET',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          // Should return null for non-existent accreditation (not throw)
          const balance =
            await request.wasteBalancesRepository.findByAccreditationId(
              'non-existent-accreditation'
            )
          return { found: balance !== null }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'GET', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.found).toBe(false)
    })
  })
})
