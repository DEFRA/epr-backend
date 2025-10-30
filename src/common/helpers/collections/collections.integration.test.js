import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Db, MongoClient } from 'mongodb'
import { LockManager } from 'mongo-locks'
import { randomUUID } from 'node:crypto'

describe('MongoDB collections setup', () => {
  let server
  let originalMongoDatabase
  const testDbName = `epr-backend-test-${randomUUID()}`

  beforeAll(async () => {
    originalMongoDatabase = process.env.MONGO_DATABASE
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
