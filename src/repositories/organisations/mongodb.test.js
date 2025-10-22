import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest'
import { createOrganisationsRepository } from './mongodb.js'
import { testOrganisationsRepositoryContract } from './port.contract.js'
import { buildOrganisation } from './contract/test-data.js'

describe('MongoDB organisations repository', () => {
  let server
  let organisationsRepositoryFactory
  const COLLECTION_NAME = 'epr-organisations'

  beforeAll(async () => {
    const { createServer } = await import('#server/server.js')
    server = await createServer()
    await server.initialize()

    organisationsRepositoryFactory = createOrganisationsRepository(server.db)
  })

  beforeEach(async () => {
    await server.db.collection(COLLECTION_NAME).deleteMany({})
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('organisations repository contract', () => {
    testOrganisationsRepositoryContract(() => organisationsRepositoryFactory())
  })

  describe('MongoDB-specific error handling', () => {
    it('rethrows unexpected database errors during insert', async () => {
      const dbMock = {
        collection: () => ({
          insertOne: async () => {
            const error = new Error('Unexpected database error')
            error.code = 99999
            throw error
          }
        })
      }

      const repository = createOrganisationsRepository(dbMock)()
      const orgData = buildOrganisation()

      await expect(repository.insert(orgData)).rejects.toThrow(
        'Unexpected database error'
      )
    })
  })

  it('findByOrgId returns a single organisation by orgId', async () => {
    const org = { _id: 'mongo-id', orgId: '500123', name: 'Acme' }
    const findOne = vi.fn().mockResolvedValue(org)
    const collection = vi.fn(() => ({ findOne }))
    const db = { collection }

    const repo = createOrganisationsRepository(db)()
    const result = await repo.findByOrgId('500123')

    expect(collection).toHaveBeenCalledWith('epr-organisations')
    expect(findOne).toHaveBeenCalledWith({ orgId: '500123' })
    expect(result).toEqual(org)
  })

  it('findByOrgId returns null when organisation does not exist', async () => {
    const findOne = vi.fn().mockResolvedValue(null)
    const collection = vi.fn(() => ({ findOne }))
    const db = { collection }

    const repo = createOrganisationsRepository(db)()
    const result = await repo.findByOrgId('999999')

    expect(collection).toHaveBeenCalledWith('epr-organisations')
    expect(findOne).toHaveBeenCalledWith({ orgId: '999999' })
    expect(result).toBeNull()
  })
})
