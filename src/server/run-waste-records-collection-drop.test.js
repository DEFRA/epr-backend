import { randomUUID } from 'node:crypto'
import { describe, expect, vi, beforeEach } from 'vitest'

import { it as mongoClientIt } from '#vite/fixtures/mongo-client.js'
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

/**
 * These assertions are on the whole set of collection names in the database,
 * so each test needs a database of its own rather than the shared fixture's
 * single named one — otherwise a collection seeded by one test is visible to
 * the next.
 */
const it = /** @type {import('vitest').TestAPI<DatabaseFixture>} */ (
  mongoClientIt.extend({
    database: async ({ mongoClient }, use) => {
      const database = mongoClient.db(`epr-backend-test-${randomUUID()}`)
      await use(database)
      await database.dropDatabase()
    }
  })
)

const buildServer = (db, { dropEnabled = true } = {}) => ({
  db,
  featureFlags: {
    isDropWasteRecordsCollectionEnabled: () => dropEnabled
  }
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
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('warns when the dropped collection still held documents, because a surviving writer would recreate it', async ({
    database
  }) => {
    await seedWasteRecords(database, 3)

    await runWasteRecordsCollectionDrop(buildServer(database))

    expect(logger.warn).toHaveBeenCalledWith({
      message:
        'Waste records collection drop: dropped waste-records, which held 3 documents — anything still writing to it will recreate it'
    })
  })

  it('drops an empty collection without warning', async ({ database }) => {
    await database.createCollection('waste-records')

    await runWasteRecordsCollectionDrop(buildServer(database))

    expect(await collectionNames(database)).not.toContain('waste-records')
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Waste records collection drop: dropped empty waste-records'
    })
    expect(logger.warn).not.toHaveBeenCalled()
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

  it('reports the collection as absent when the flag is off and it has already gone', async ({
    database
  }) => {
    await runWasteRecordsCollectionDrop(
      buildServer(database, { dropEnabled: false })
    )

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

  it('tolerates every pod in a deploy running it at once', async ({
    database
  }) => {
    await seedWasteRecords(database, 4)

    await Promise.all(
      Array.from({ length: 5 }, () =>
        runWasteRecordsCollectionDrop(buildServer(database))
      )
    )

    expect(await collectionNames(database)).not.toContain('waste-records')
    expect(logger.error).not.toHaveBeenCalled()
  })

  // A real Mongo cannot be made to fail the drop, so this is the one case that
  // needs a stub. It answers only for 'waste-records' so the test still fails
  // if the production code ever names a different collection.
  it('logs an error when the drop itself fails', async () => {
    const error = new Error('not authorised to drop')
    const db = {
      listCollections: ({ name }) => ({
        toArray: async () => (name === 'waste-records' ? [{ name }] : [])
      }),
      collection: (name) => ({
        estimatedDocumentCount: async () =>
          name === 'waste-records' ? 1 : undefined
      }),
      dropCollection: async (name) => {
        expect(name).toBe('waste-records')
        throw error
      }
    }

    await runWasteRecordsCollectionDrop(buildServer(db))

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run waste records collection drop'
    })
  })
})
