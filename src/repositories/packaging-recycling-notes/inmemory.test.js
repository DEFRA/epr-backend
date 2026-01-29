import { describe, expect, it as base } from 'vitest'
import { createInMemoryPackagingRecyclingNotesRepository } from './inmemory.js'
import { testPackagingRecyclingNotesRepositoryContract } from './port.contract.js'

const it = base.extend({
  packagingRecyclingNotesRepositoryFactory: async (
    // eslint-disable-next-line no-empty-pattern
    {},
    use
  ) => {
    const factory = createInMemoryPackagingRecyclingNotesRepository()
    await use(factory)
  },

  packagingRecyclingNotesRepository: async (
    { packagingRecyclingNotesRepositoryFactory },
    use
  ) => {
    const repository = packagingRecyclingNotesRepositoryFactory()
    await use(repository)
  }
})

describe('In-memory packaging recycling notes repository', () => {
  describe('packaging recycling notes repository contract', () => {
    testPackagingRecyclingNotesRepositoryContract(it)
  })

  describe('factory', () => {
    it('creates the repository with expected methods', async ({
      packagingRecyclingNotesRepository
    }) => {
      expect(packagingRecyclingNotesRepository).toEqual({
        insert: expect.any(Function),
        findById: expect.any(Function),
        findByAccreditationId: expect.any(Function)
      })
    })

    it('accepts initial data with _id', async () => {
      const initialData = [
        { _id: 'prn-1', prnNumber: 'PRN-001' },
        { _id: 'prn-2', prnNumber: 'PRN-002' }
      ]
      const factory =
        createInMemoryPackagingRecyclingNotesRepository(initialData)
      const repository = factory()

      const result = await repository.findById('prn-1')

      expect(result.prnNumber).toBe('PRN-001')
    })

    it('accepts initial data with id (no underscore)', async () => {
      const initialData = [{ id: 'prn-1', prnNumber: 'PRN-001' }]
      const factory =
        createInMemoryPackagingRecyclingNotesRepository(initialData)
      const repository = factory()

      const result = await repository.findById('prn-1')

      expect(result.prnNumber).toBe('PRN-001')
    })
  })

  describe('data isolation', () => {
    it('returns clones to prevent mutation on findById', async () => {
      const prn = { _id: 'prn-123', prnNumber: 'PRN-001' }
      const factory = createInMemoryPackagingRecyclingNotesRepository([prn])
      const repository = factory()

      const result = await repository.findById('prn-123')
      result.prnNumber = 'MUTATED'

      const secondResult = await repository.findById('prn-123')

      expect(secondResult.prnNumber).toBe('PRN-001')
    })

    it('returns clones to prevent mutation on findByAccreditationId', async () => {
      const prn = {
        _id: 'prn-1',
        accreditationId: 'acc-123',
        prnNumber: 'PRN-001'
      }
      const factory = createInMemoryPackagingRecyclingNotesRepository([prn])
      const repository = factory()

      const result = await repository.findByAccreditationId('acc-123')
      result[0].prnNumber = 'MUTATED'

      const secondResult = await repository.findByAccreditationId('acc-123')

      expect(secondResult[0].prnNumber).toBe('PRN-001')
    })
  })

  describe('findByAccreditationId filtering', () => {
    it('returns only PRNs matching the accreditation', async () => {
      const prns = [
        { _id: 'prn-1', accreditationId: 'acc-123', prnNumber: 'PRN-001' },
        { _id: 'prn-2', accreditationId: 'acc-123', prnNumber: 'PRN-002' },
        { _id: 'prn-3', accreditationId: 'acc-456', prnNumber: 'PRN-003' }
      ]
      const factory = createInMemoryPackagingRecyclingNotesRepository(prns)
      const repository = factory()

      const result = await repository.findByAccreditationId('acc-123')

      expect(result).toHaveLength(2)
      expect(result[0].prnNumber).toBe('PRN-001')
      expect(result[1].prnNumber).toBe('PRN-002')
    })
  })
})
