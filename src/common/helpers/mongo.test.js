import { Db, MongoClient } from 'mongodb'
import { LockManager } from 'mongo-locks'
import {
  serverTest as test,
  describe,
  expect
} from '../../../.vite/db-fixture.js'

describe('mongoDb', () => {
  describe('Set up', () => {
    test('should have expected decorators', async ({ server }) => {
      expect(server.db).toBeInstanceOf(Db)
      expect(server.mongoClient).toBeInstanceOf(MongoClient)
      expect(server.locker).toBeInstanceOf(LockManager)
    })

    test('should have expected database name', async ({ server }) => {
      expect(server.db.databaseName).toBe('epr-backend')
    })

    test('should have expected namespace', async ({ server }) => {
      expect(server.db.namespace).toBe('epr-backend')
    })
  })

  describe('Shut down', () => {
    test('should close Mongo client on server stop', async ({ server }) => {
      const closeSpy = vi.spyOn(server.mongoClient, 'close')
      await server.stop()

      expect(closeSpy).toHaveBeenCalledWith()
    })
  })
})
