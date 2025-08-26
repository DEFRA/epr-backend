import { MongoClient } from 'mongodb'
import { LockManager } from 'mongo-locks'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../enums/index.js'
import {
  createOrUpdateCollections,
  createIndexes,
  createSeedData
} from './collections/create-update.js'

export const mongoDb = {
  plugin: {
    name: 'mongodb',
    version: '1.0.0',
    register: async function (server, options) {
      server.logger.info({
        message: 'Setting up MongoDb',
        event: {
          category: LOGGING_EVENT_CATEGORIES.DB,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_INITIALISING
        }
      })

      const client = await MongoClient.connect(options.mongoUrl, {
        ...options.mongoOptions
      })

      const databaseName = options.databaseName
      const db = client.db(databaseName)
      const locker = new LockManager(db.collection('mongo-locks'))

      await createOrUpdateCollections(db)
      await createIndexes(db)
      await createSeedData(db)

      server.logger.info({
        message: `MongoDb connected to ${databaseName}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.DB,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_SUCCESS
        }
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
          event: {
            category: LOGGING_EVENT_CATEGORIES.DB,
            action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING
          }
        })
        try {
          await client.close()
          // @fixme: add coverage
          /* c8 ignore start */
        } catch (err) {
          server.logger.error({
            err,
            message: 'Failed to close mongo client',
            event: {
              category: LOGGING_EVENT_CATEGORIES.DB,
              action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING
            }
          })
        }
        /* c8 ignore stop */
      })
    }
  }
}
