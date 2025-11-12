import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup as setupMongo, teardown as teardownMongo } from 'vitest-mongodb'
import { Db, MongoClient } from 'mongodb'
import { LockManager } from 'mongo-locks'
import { randomUUID } from 'node:crypto'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

describe('MongoDB plugin', () => {
  let server
  let originalMongoDatabase
  const testDbName = `epr-backend-test-${randomUUID()}`
  setupAuthContext()

  beforeAll(async () => {
    await setupMongo({
      binary: {
        version: 'latest'
      },
      serverOptions: {},
      autoStart: false
    })

    const mongoUri = globalThis.__MONGO_URI__
    originalMongoDatabase = process.env.MONGO_DATABASE
    process.env.MONGO_URI = mongoUri
    process.env.MONGO_DATABASE = testDbName

    const { createServer } = await import('#server/server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    if (server) {
      await server.db.dropDatabase()
      await server.stop()
    }
    process.env.MONGO_DATABASE = originalMongoDatabase
    await teardownMongo()
  })

  it('should have expected decorators', () => {
    expect(server.db).toBeInstanceOf(Db)
    expect(server.mongoClient).toBeInstanceOf(MongoClient)
    expect(server.locker).toBeInstanceOf(LockManager)
  })

  it('should have expected database name', () => {
    expect(server.db.databaseName).toBe(testDbName)
  })

  it('should have expected namespace', () => {
    expect(server.db.namespace).toBe(testDbName)
  })

  it('should handle re-initialization against existing database', async () => {
    const { createServer } = await import('#server/server.js')
    const server2 = await createServer()
    await server2.initialize()
    await server2.stop()

    expect(server2.db).toBeInstanceOf(Db)
  })
})
