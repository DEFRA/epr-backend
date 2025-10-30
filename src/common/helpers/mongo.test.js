import { Db, MongoClient } from 'mongodb'
import { LockManager } from 'mongo-locks'

describe('mongoDb', () => {
  let server

  beforeAll(async () => {
    // Dynamic import needed due to config being updated by vitest-mongodb
    const { createServer } = await import('#server/server.js')

    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('should have expected decorators', () => {
    expect(server.db).toBeInstanceOf(Db)
    expect(server.mongoClient).toBeInstanceOf(MongoClient)
    expect(server.locker).toBeInstanceOf(LockManager)
  })

  it('should have expected database name', () => {
    expect(server.db.databaseName).toBe('epr-backend')
  })

  it('should have expected namespace', () => {
    expect(server.db.namespace).toBe('epr-backend')
  })

  it('should close Mongo client on server stop', async () => {
    const closeSpy = vi.spyOn(server.mongoClient, 'close')
    await server.stop()

    expect(closeSpy).toHaveBeenCalledWith()
  })
})
