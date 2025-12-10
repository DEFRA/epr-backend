import { describe, it as base, expect, it, vi } from 'vitest'
import { createInMemoryWasteBalancesRepository } from './inmemory.js'
import { testWasteBalancesRepositoryContract } from './port.contract.js'
import { EXPORTER_FIELD } from '#domain/waste-balances/constants.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

const extendedIt = base.extend({
  // eslint-disable-next-line no-empty-pattern
  wasteBalanceStorage: async ({}, use) => {
    const storage = []
    await use(storage)
  },
  // eslint-disable-next-line no-empty-pattern
  organisationsRepository: async ({}, use) => {
    const mock = {
      getAccreditationById: vi.fn()
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

  testWasteBalancesRepositoryContract(extendedIt)

  describe('implementation details', () => {
    it('throws if organisationsRepository is missing', async () => {
      const repository = createInMemoryWasteBalancesRepository()
      const instance = repository()
      await expect(
        instance.updateWasteBalanceTransactions([], 'acc-1')
      ).rejects.toThrow('organisationsRepository dependency is required')
    })

    it('throws if accreditation is not found', async () => {
      const organisationsRepository = {
        getAccreditationById: vi.fn().mockResolvedValue(null)
      }
      const repository = createInMemoryWasteBalancesRepository([], {
        organisationsRepository
      })
      const instance = repository()
      await expect(
        instance.updateWasteBalanceTransactions([], 'acc-1')
      ).rejects.toThrow('Accreditation not found: acc-1')
    })

    it('does nothing if no transactions are generated', async () => {
      const organisationsRepository = {
        getAccreditationById: vi
          .fn()
          .mockResolvedValue({ validFrom: '2023-01-01', validTo: '2023-12-31' })
      }
      const storage = []
      const repository = createInMemoryWasteBalancesRepository(storage, {
        organisationsRepository
      })
      const instance = repository()

      // Pass record with PRN issued so no transactions are generated
      const record = {
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [EXPORTER_FIELD.PRN_ISSUED]: 'Yes',
          [EXPORTER_FIELD.DATE_OF_DISPATCH]: '2023-06-01'
        }
      }

      await instance.updateWasteBalanceTransactions([record], 'acc-1')

      expect(storage).toHaveLength(0)
    })

    it('creates new balance if not exists', async () => {
      const organisationsRepository = {
        getAccreditationById: vi
          .fn()
          .mockResolvedValue({ validFrom: '2023-01-01', validTo: '2023-12-31' })
      }
      const storage = []
      const repository = createInMemoryWasteBalancesRepository(storage, {
        organisationsRepository
      })
      const instance = repository()

      const record = {
        organisationId: 'org-1',
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [EXPORTER_FIELD.DATE_OF_DISPATCH]: '2023-06-01',
          [EXPORTER_FIELD.EXPORT_TONNAGE]: 10,
          [EXPORTER_FIELD.PRN_ISSUED]: 'No',
          [EXPORTER_FIELD.INTERIM_SITE]: 'No'
        }
      }

      await instance.updateWasteBalanceTransactions([record], 'acc-1')

      expect(storage).toHaveLength(1)
      expect(storage[0].amount).toBe(10)
    })

    it('updates existing balance', async () => {
      const organisationsRepository = {
        getAccreditationById: vi
          .fn()
          .mockResolvedValue({ validFrom: '2023-01-01', validTo: '2023-12-31' })
      }
      const existingBalance = {
        accreditationId: 'acc-1',
        amount: 10,
        availableAmount: 10,
        transactions: [{ id: 'tx-1', amount: 10 }]
      }
      const storage = [existingBalance]
      const repository = createInMemoryWasteBalancesRepository(storage, {
        organisationsRepository
      })
      const instance = repository()

      const record = {
        organisationId: 'org-1',
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [EXPORTER_FIELD.PRN_ISSUED]: 'No',
          [EXPORTER_FIELD.DATE_OF_DISPATCH]: '2023-06-01',
          [EXPORTER_FIELD.EXPORT_TONNAGE]: '20.0',
          [EXPORTER_FIELD.INTERIM_SITE]: 'No'
        }
      }

      await instance.updateWasteBalanceTransactions([record], 'acc-1')

      expect(storage).toHaveLength(1)
      expect(storage[0].amount).toBe(30)
      expect(storage[0].transactions).toHaveLength(2)
    })
  })
})
