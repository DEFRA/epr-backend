import { describe, expect, it } from 'vitest'
import {
  createPackagingRecyclingNotesRepository,
  PrnNumberConflictError
} from './mongodb'

describe('MongoDB packaging recycling notes repository', () => {
  it('creates the repository with all methods', async () => {
    const hexId = '123456789012345678901234'
    const prn = { _id: { toHexString: () => hexId }, tonnage: 100 }

    const dbMock = {
      collection: function () {
        return this
      },
      createIndex: async () => {},
      findOne: function () {
        return prn
      },
      insertOne: async () => ({ insertedId: { toHexString: () => hexId } }),
      find: function () {
        return {
          toArray: async () => [prn]
        }
      }
    }
    const factory = await createPackagingRecyclingNotesRepository(dbMock)
    const repository = factory()

    expect(repository).toEqual({
      findById: expect.any(Function),
      create: expect.any(Function),
      findByAccreditation: expect.any(Function),
      updateStatus: expect.any(Function)
    })

    expect(await repository.findById(hexId)).toEqual({ ...prn, id: hexId })
  })

  describe('create', () => {
    it('inserts a PRN and returns it with generated id', async () => {
      const hexId = '123456789012345678901234'
      const prnInput = {
        issuedByOrganisation: 'org-123',
        tonnage: 100,
        material: 'plastic'
      }

      const dbMock = {
        collection: function () {
          return this
        },
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async () => ({ insertedId: { toHexString: () => hexId } }),
        find: function () {
          return { toArray: async () => [] }
        }
      }

      const factory = await createPackagingRecyclingNotesRepository(dbMock)
      const repository = factory()

      const result = await repository.create(prnInput)

      expect(result).toEqual({
        ...prnInput,
        id: hexId
      })
    })
  })

  describe('findByAccreditation', () => {
    it('returns PRNs for the specified accreditation', async () => {
      const hexId1 = '123456789012345678901234'
      const hexId2 = '234567890123456789012345'
      const accreditationId = 'acc-001'

      const prns = [
        {
          _id: { toHexString: () => hexId1 },
          issuedByAccreditation: accreditationId,
          tonnage: 100
        },
        {
          _id: { toHexString: () => hexId2 },
          issuedByAccreditation: accreditationId,
          tonnage: 200
        }
      ]

      const dbMock = {
        collection: function () {
          return this
        },
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async () => ({ insertedId: { toHexString: () => hexId1 } }),
        find: function () {
          return {
            toArray: async () => prns
          }
        }
      }

      const factory = await createPackagingRecyclingNotesRepository(dbMock)
      const repository = factory()

      const result = await repository.findByAccreditation(accreditationId)

      expect(result).toEqual([
        { ...prns[0], id: hexId1 },
        { ...prns[1], id: hexId2 }
      ])
    })

    it('returns empty array when no PRNs found', async () => {
      const dbMock = {
        collection: function () {
          return this
        },
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async () => ({
          insertedId: { toHexString: () => '123456789012345678901234' }
        }),
        find: function () {
          return {
            toArray: async () => []
          }
        }
      }

      const factory = await createPackagingRecyclingNotesRepository(dbMock)
      const repository = factory()

      const result = await repository.findByAccreditation('acc-nonexistent')

      expect(result).toEqual([])
    })
  })

  describe('findById', () => {
    it('returns null when PRN not found', async () => {
      const dbMock = {
        collection: function () {
          return this
        },
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async () => ({
          insertedId: { toHexString: () => '123456789012345678901234' }
        }),
        find: function () {
          return { toArray: async () => [] }
        }
      }

      const factory = await createPackagingRecyclingNotesRepository(dbMock)
      const repository = factory()

      const result = await repository.findById('123456789012345678901234')

      expect(result).toBeNull()
    })

    it('returns PRN with id when found', async () => {
      const hexId = '123456789012345678901234'
      const prn = {
        _id: { toHexString: () => hexId },
        issuedByOrganisation: 'org-123',
        tonnage: 100
      }

      const dbMock = {
        collection: function () {
          return this
        },
        createIndex: async () => {},
        findOne: async () => prn,
        insertOne: async () => ({ insertedId: { toHexString: () => hexId } }),
        find: function () {
          return { toArray: async () => [] }
        }
      }

      const factory = await createPackagingRecyclingNotesRepository(dbMock)
      const repository = factory()

      const result = await repository.findById(hexId)

      expect(result).toEqual({
        ...prn,
        id: hexId
      })
    })
  })

  describe('updateStatus', () => {
    it('updates status and returns PRN with id', async () => {
      const hexId = '123456789012345678901234'
      const updatedPrn = {
        _id: { toHexString: () => hexId },
        issuedByOrganisation: 'org-123',
        tonnage: 100,
        status: {
          currentStatus: 'awaiting_authorisation',
          history: [
            { status: 'draft', updatedAt: new Date() },
            { status: 'awaiting_authorisation', updatedAt: new Date() }
          ]
        }
      }

      const dbMock = {
        collection: function () {
          return this
        },
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async () => ({ insertedId: { toHexString: () => hexId } }),
        find: function () {
          return { toArray: async () => [] }
        },
        findOneAndUpdate: async () => updatedPrn
      }

      const factory = await createPackagingRecyclingNotesRepository(dbMock)
      const repository = factory()

      const result = await repository.updateStatus({
        id: hexId,
        status: 'awaiting_authorisation',
        updatedBy: 'user-123',
        updatedAt: new Date()
      })

      expect(result).toEqual({
        ...updatedPrn,
        id: hexId
      })
    })

    it('returns null when PRN not found', async () => {
      const hexId = '123456789012345678901234'

      const dbMock = {
        collection: function () {
          return this
        },
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async () => ({ insertedId: { toHexString: () => hexId } }),
        find: function () {
          return { toArray: async () => [] }
        },
        findOneAndUpdate: async () => null
      }

      const factory = await createPackagingRecyclingNotesRepository(dbMock)
      const repository = factory()

      const result = await repository.updateStatus({
        id: hexId,
        status: 'awaiting_authorisation',
        updatedBy: 'user-123',
        updatedAt: new Date()
      })

      expect(result).toBeNull()
    })

    it('sets prnNumber when provided', async () => {
      const hexId = '123456789012345678901234'
      const prnNumber = 'ER2612345'
      let capturedUpdate = null

      const dbMock = {
        collection: function () {
          return this
        },
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async () => ({ insertedId: { toHexString: () => hexId } }),
        find: function () {
          return { toArray: async () => [] }
        },
        findOneAndUpdate: async (filter, update) => {
          capturedUpdate = update
          return {
            _id: { toHexString: () => hexId },
            prnNumber,
            status: { currentStatus: 'awaiting_acceptance', history: [] }
          }
        }
      }

      const factory = await createPackagingRecyclingNotesRepository(dbMock)
      const repository = factory()

      await repository.updateStatus({
        id: hexId,
        status: 'awaiting_acceptance',
        updatedBy: 'user-123',
        updatedAt: new Date(),
        prnNumber
      })

      expect(capturedUpdate.$set.prnNumber).toBe(prnNumber)
    })

    it('does not set prnNumber when not provided', async () => {
      const hexId = '123456789012345678901234'
      let capturedUpdate = null

      const dbMock = {
        collection: function () {
          return this
        },
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async () => ({ insertedId: { toHexString: () => hexId } }),
        find: function () {
          return { toArray: async () => [] }
        },
        findOneAndUpdate: async (filter, update) => {
          capturedUpdate = update
          return {
            _id: { toHexString: () => hexId },
            status: { currentStatus: 'awaiting_authorisation', history: [] }
          }
        }
      }

      const factory = await createPackagingRecyclingNotesRepository(dbMock)
      const repository = factory()

      await repository.updateStatus({
        id: hexId,
        status: 'awaiting_authorisation',
        updatedBy: 'user-123',
        updatedAt: new Date()
      })

      expect(capturedUpdate.$set.prnNumber).toBeUndefined()
    })

    it('throws PrnNumberConflictError when prnNumber already exists', async () => {
      const hexId = '123456789012345678901234'
      const prnNumber = 'ER2612345'
      const duplicateKeyError = new Error('duplicate key error')
      duplicateKeyError.code = 11000
      duplicateKeyError.keyPattern = { prnNumber: 1 }

      const dbMock = {
        collection: function () {
          return this
        },
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async () => ({ insertedId: { toHexString: () => hexId } }),
        find: function () {
          return { toArray: async () => [] }
        },
        findOneAndUpdate: async () => {
          throw duplicateKeyError
        }
      }

      const factory = await createPackagingRecyclingNotesRepository(dbMock)
      const repository = factory()

      await expect(
        repository.updateStatus({
          id: hexId,
          status: 'awaiting_acceptance',
          updatedBy: 'user-123',
          updatedAt: new Date(),
          prnNumber
        })
      ).rejects.toThrow(PrnNumberConflictError)
    })

    it('rethrows other MongoDB errors', async () => {
      const hexId = '123456789012345678901234'
      const otherError = new Error('Some other MongoDB error')
      otherError.code = 12345

      const dbMock = {
        collection: function () {
          return this
        },
        createIndex: async () => {},
        findOne: async () => null,
        insertOne: async () => ({ insertedId: { toHexString: () => hexId } }),
        find: function () {
          return { toArray: async () => [] }
        },
        findOneAndUpdate: async () => {
          throw otherError
        }
      }

      const factory = await createPackagingRecyclingNotesRepository(dbMock)
      const repository = factory()

      await expect(
        repository.updateStatus({
          id: hexId,
          status: 'awaiting_acceptance',
          updatedBy: 'user-123',
          updatedAt: new Date(),
          prnNumber: 'ER2612345'
        })
      ).rejects.toThrow('Some other MongoDB error')
    })
  })

  describe('ensureCollection', () => {
    it('creates unique index on prnNumber', async () => {
      const createdIndexes = []

      const dbMock = {
        collection: function () {
          return this
        },
        createIndex: async (fields, options) => {
          createdIndexes.push({ fields, options })
        },
        findOne: async () => null,
        insertOne: async () => ({
          insertedId: { toHexString: () => '123456789012345678901234' }
        }),
        find: function () {
          return { toArray: async () => [] }
        }
      }

      await createPackagingRecyclingNotesRepository(dbMock)

      const prnNumberIndex = createdIndexes.find(
        (idx) => idx.options.name === 'prnNumber'
      )
      expect(prnNumberIndex).toBeDefined()
      expect(prnNumberIndex.options.unique).toBe(true)
      expect(prnNumberIndex.options.sparse).toBe(true)
    })
  })
})
