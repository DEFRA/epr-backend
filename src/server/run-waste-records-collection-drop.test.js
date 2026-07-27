import { randomUUID } from 'node:crypto'
import { describe, expect, vi, beforeEach } from 'vitest'
import { MongoClient } from 'mongodb'

import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { logger } from '#common/helpers/logging/logger.js'
import { runWasteRecordsCollectionDrop } from './run-waste-records-collection-drop.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

/**
 * @typedef {{ database: import('mongodb').Db }} DatabaseFixture
 */

const it = /** @type {import('vitest').TestAPI<DatabaseFixture>} */ (
  mongoIt.extend({
    database: async ({ db }, use) => {
      const client = await MongoClient.connect(db)
      const database = client.db(`epr-backend-test-${randomUUID()}`)
      await use(database)
      await database.dropDatabase()
      await client.close()
    }
  })
)

const buildServer = (
  db,
  {
    lock = { free: vi.fn().mockResolvedValue(undefined) },
    dropEnabled = true
  } = {}
) => ({
  db,
  featureFlags: {
    isDropWasteRecordsCollectionEnabled: () => dropEnabled
  },
  locker: { lock: vi.fn().mockResolvedValue(lock) }
})

const collectionNames = async (db) =>
  (await db.listCollections({}, { nameOnly: true }).toArray()).map(
    (collection) => collection.name
  )

const seedWasteRecords = (db, count) =>
  db
    .collection('waste-records')
    .insertMany(Array.from({ length: count }, (_, index) => ({ index })))

describe('runWasteRecordsCollectionDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('drops the collection when the flag is on', async ({ database }) => {
    await seedWasteRecords(database, 3)

    await runWasteRecordsCollectionDrop(buildServer(database))

    expect(await collectionNames(database)).not.toContain('waste-records')
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste records collection drop: dropped waste-records, which held 3 documents'
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('leaves the collection in place and reports its size when the flag is off', async ({
    database
  }) => {
    await seedWasteRecords(database, 2)

    await runWasteRecordsCollectionDrop(
      buildServer(database, { dropEnabled: false })
    )

    expect(await collectionNames(database)).toContain('waste-records')
    expect(await database.collection('waste-records').countDocuments()).toBe(2)
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste records collection drop: waste-records is still present with 2 documents; leaving it in place because the drop is not enabled'
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('does nothing when the collection is already absent', async ({
    database
  }) => {
    await runWasteRecordsCollectionDrop(buildServer(database))

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste records collection drop: waste-records is already absent, nothing to drop'
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('stays a no-op when run again after the collection has been dropped', async ({
    database
  }) => {
    await seedWasteRecords(database, 1)

    await runWasteRecordsCollectionDrop(buildServer(database))
    vi.clearAllMocks()
    await runWasteRecordsCollectionDrop(buildServer(database))

    expect(await collectionNames(database)).not.toContain('waste-records')
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste records collection drop: waste-records is already absent, nothing to drop'
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('acquires a lock scoped to the drop and releases it afterwards', async ({
    database
  }) => {
    const lock = { free: vi.fn().mockResolvedValue(undefined) }
    const server = buildServer(database, { lock })

    await runWasteRecordsCollectionDrop(server)

    expect(server.locker.lock).toHaveBeenCalledWith(
      'waste-records-collection-drop'
    )
    expect(lock.free).toHaveBeenCalled()
  })

  it('leaves the collection alone when the lock is held by another instance', async ({
    database
  }) => {
    await seedWasteRecords(database, 1)
    const server = {
      db: database,
      featureFlags: { isDropWasteRecordsCollectionEnabled: () => true },
      locker: { lock: vi.fn().mockResolvedValue(null) }
    }

    await runWasteRecordsCollectionDrop(server)

    expect(await collectionNames(database)).toContain('waste-records')
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping waste records collection drop'
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('releases the lock and logs an error when the drop itself fails', async () => {
    const error = new Error('not authorised to drop')
    const lock = { free: vi.fn().mockResolvedValue(undefined) }
    const db = {
      listCollections: () => ({
        toArray: async () => [{ name: 'waste-records' }]
      }),
      collection: () => ({ countDocuments: async () => 1 }),
      dropCollection: async () => {
        throw error
      }
    }

    await runWasteRecordsCollectionDrop(buildServer(db, { lock }))

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run waste records collection drop'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async ({ database }) => {
    const error = new Error('locker unavailable')

    await runWasteRecordsCollectionDrop({
      db: database,
      featureFlags: { isDropWasteRecordsCollectionEnabled: () => true },
      locker: { lock: vi.fn().mockRejectedValue(error) }
    })

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run waste records collection drop'
    })
  })
})
