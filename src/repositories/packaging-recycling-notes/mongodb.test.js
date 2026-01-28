import { describe, expect, it } from 'vitest'
import { createPackagingRecyclingNotesRepository } from './mongodb'

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
      findByOrganisation: expect.any(Function),
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

  describe('findByOrganisation', () => {
    it('returns PRNs for the specified organisation', async () => {
      const hexId1 = '123456789012345678901234'
      const hexId2 = '234567890123456789012345'
      const organisationId = 'org-123'

      const prns = [
        {
          _id: { toHexString: () => hexId1 },
          issuedByOrganisation: organisationId,
          tonnage: 100
        },
        {
          _id: { toHexString: () => hexId2 },
          issuedByOrganisation: organisationId,
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

      const result = await repository.findByOrganisation(organisationId)

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

      const result = await repository.findByOrganisation('org-nonexistent')

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
  })
})
