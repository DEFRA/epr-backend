import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { describe, expect } from 'vitest'
import { createOrsImportsRepository } from './mongodb.js'
import { ORS_IMPORT_STATUS } from '../../domain/import-status.js'

const DATABASE_NAME = 'epr-backend'
const COLLECTION_NAME = 'ors-imports'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  repository: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await database.collection(COLLECTION_NAME).deleteMany({})
    const factory = await createOrsImportsRepository(database)
    await use(factory())
  }
})

describe('MongoDB ORS imports repository', () => {
  it('creates and retrieves an import document', async ({ repository }) => {
    const created = await repository.create({
      _id: 'import-test-1',
      status: ORS_IMPORT_STATUS.PENDING,
      files: [{ fileId: 'f1', fileName: 'a.xlsx', s3Uri: 's3://bucket/f1' }]
    })

    expect(created._id).toBe('import-test-1')
    expect(created.createdAt).toBeDefined()
    expect(created.updatedAt).toBeDefined()

    const found = await repository.findById('import-test-1')
    expect(found._id).toBe('import-test-1')
    expect(found.status).toBe(ORS_IMPORT_STATUS.PENDING)
    expect(found.files).toHaveLength(1)
  })

  it('returns null for nonexistent import', async ({ repository }) => {
    const found = await repository.findById('nonexistent')
    expect(found).toBeNull()
  })

  it('updates the status', async ({ repository }) => {
    await repository.create({
      _id: 'import-test-2',
      status: ORS_IMPORT_STATUS.PENDING,
      files: []
    })

    await repository.updateStatus('import-test-2', ORS_IMPORT_STATUS.PROCESSING)

    const found = await repository.findById('import-test-2')
    expect(found.status).toBe(ORS_IMPORT_STATUS.PROCESSING)
  })

  it('records a file result by index', async ({ repository }) => {
    await repository.create({
      _id: 'import-test-3',
      status: ORS_IMPORT_STATUS.PROCESSING,
      files: [
        { fileId: 'f1', fileName: 'a.xlsx', s3Uri: 's3://bucket/f1' },
        { fileId: 'f2', fileName: 'b.xlsx', s3Uri: 's3://bucket/f2' }
      ]
    })

    const result = {
      status: 'success',
      sitesCreated: 5,
      mappingsUpdated: 5,
      registrationNumber: 'EPR/AB1234CD/R1',
      errors: []
    }

    await repository.recordFileResult('import-test-3', 1, result)

    const found = await repository.findById('import-test-3')
    expect(found.files[0].result).toBeUndefined()
    expect(found.files[1].result).toEqual(result)
  })
})
