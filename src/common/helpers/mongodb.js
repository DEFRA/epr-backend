import { MongoClient } from 'mongodb'
import { LockManager } from 'mongo-locks'

export const mongoDb = {
  plugin: {
    name: 'mongodb',
    version: '1.0.0',
    register: async function (server, options) {
      server.logger.info({
        message: 'Setting up MongoDb',
        event: { category: 'database', action: 'connection_initialising' }
      })

      const client = await MongoClient.connect(options.mongoUrl, {
        ...options.mongoOptions
      })

      const databaseName = options.databaseName
      const db = client.db(databaseName)
      const locker = new LockManager(db.collection('mongo-locks'))

      await createIndexes(db)

      server.logger.info({
        message: `MongoDb connected to ${databaseName}`,
        event: { category: 'database', action: 'connection_succeeded' }
      })

      server.decorate('server', 'mongoClient', client)
      server.decorate('server', 'db', db)
      server.decorate('server', 'locker', locker)
      // @fixme: add coverage
      /* c8 ignore start */
      server.decorate('request', 'db', () => db, { apply: true })
      server.decorate('request', 'locker', () => locker, { apply: true })
      /* c8 ignore stop */

      server.events.on('stop', async () => {
        server.logger.info({
          message: 'Closing Mongo client',
          event: { category: 'database', action: 'connection_closing' }
        })
        try {
          await client.close()
          // @fixme: add coverage
          /* c8 ignore start */
        } catch (err) {
          server.logger.error({
            err,
            message: 'failed to close mongo client',
            event: { category: 'database', action: 'connection_closing' }
          })
        }
        /* c8 ignore stop */
      })
    }
  }
}

async function createIndexes(db) {
  await db.collection('mongo-locks').createIndex({ id: 1 })

  // Example of how to create a mongodb index. Remove as required
  await db.collection('example-data').createIndex({ id: 1 })
}
