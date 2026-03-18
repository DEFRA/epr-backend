import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { afterEach, describe, expect, vi } from 'vitest'
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
  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates and retrieves an import document', async ({ repository }) => {
    const created = await repository.create({
      _id: 'import-test-1',
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: [{ fileId: 'f1', fileName: 'a.xlsx', s3Uri: 's3://bucket/f1' }]
    })

    expect(created._id).toBe('import-test-1')
    expect(created.createdAt).toBeDefined()
    expect(created.updatedAt).toBeDefined()

    const found = await repository.findById('import-test-1')
    expect(found._id).toBe('import-test-1')
    expect(found.status).toBe(ORS_IMPORT_STATUS.PREPROCESSING)
    expect(found.files).toHaveLength(1)
  })

  it('returns null for nonexistent import', async ({ repository }) => {
    const found = await repository.findById('nonexistent')
    expect(found).toBeNull()
  })

  it('updates the status', async ({ repository }) => {
    await repository.create({
      _id: 'import-test-2',
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })

    await repository.updateStatus('import-test-2', ORS_IMPORT_STATUS.PROCESSING)

    const found = await repository.findById('import-test-2')
    expect(found.status).toBe(ORS_IMPORT_STATUS.PROCESSING)
  })

  it('appends files to the import', async ({ repository }) => {
    await repository.create({
      _id: 'import-test-add',
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })

    const files = [
      { fileId: 'f1', fileName: 'sites.xlsx', s3Uri: 's3://bucket/f1' },
      { fileId: 'f2', fileName: 'more.xlsx', s3Uri: 's3://bucket/f2' }
    ]

    await repository.addFiles('import-test-add', files)

    const found = await repository.findById('import-test-add')
    expect(found.files).toHaveLength(2)
    expect(found.files[0]).toEqual(files[0])
    expect(found.files[1]).toEqual(files[1])
  })

  it('creates a TTL index on expiresAt', async ({ mongoClient }) => {
    const database = mongoClient.db(DATABASE_NAME)
    await database.collection(COLLECTION_NAME).deleteMany({})
    await createOrsImportsRepository(database)

    const indexes = await database
      .collection(COLLECTION_NAME)
      .listIndexes()
      .toArray()

    const ttlIndex = indexes.find(
      (idx) => idx.key?.expiresAt === 1 && idx.expireAfterSeconds === 0
    )
    expect(ttlIndex).toBeDefined()
  })

  it('sets expiresAt when creating a document', async ({ repository }) => {
    const created = await repository.create({
      _id: 'import-ttl-1',
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })

    expect(created.expiresAt).toBeInstanceOf(Date)
  })

  it('sets expiresAt to null for COMPLETED status on create', async ({
    repository
  }) => {
    const created = await repository.create({
      _id: 'import-ttl-completed',
      status: ORS_IMPORT_STATUS.COMPLETED,
      files: []
    })

    expect(created.expiresAt).toBeNull()
  })

  it('updates expiresAt when status changes', async ({ repository }) => {
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'))

    await repository.create({
      _id: 'import-ttl-2',
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })

    vi.setSystemTime(new Date('2026-01-15T13:00:00.000Z'))
    await repository.updateStatus('import-ttl-2', ORS_IMPORT_STATUS.PROCESSING)

    const found = await repository.findById('import-ttl-2')
    expect(found.expiresAt).toBeInstanceOf(Date)
    expect(found.expiresAt.getTime()).toBeGreaterThan(
      new Date('2026-01-15T13:00:00.000Z').getTime()
    )
  })

  it('sets expiresAt to null when status changes to COMPLETED', async ({
    repository
  }) => {
    await repository.create({
      _id: 'import-ttl-3',
      status: ORS_IMPORT_STATUS.PREPROCESSING,
      files: []
    })

    await repository.updateStatus('import-ttl-3', ORS_IMPORT_STATUS.COMPLETED)

    const found = await repository.findById('import-ttl-3')
    expect(found.expiresAt).toBeNull()
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
