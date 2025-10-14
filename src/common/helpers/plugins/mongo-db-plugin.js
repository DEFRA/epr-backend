import { LockManager } from 'mongo-locks'

import { createMongoClient } from '#common/helpers/mongo-client.js'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../enums/index.js'
import {
  createIndexes,
  createOrUpdateCollections,
  createSeedData
} from '../collections/create-update.js'

export const mongoDbPlugin = {
  plugin: {
    name: 'mongodb',
    version: '1.0.0',
    /**
     * @param {import('../hapi-types.js').HapiServer} server
     */
    register: async function (server, options) {
      server.logger.info({
        message: 'Setting up MongoDb',
        event: {
          category: LOGGING_EVENT_CATEGORIES.DB,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_INITIALISING
        }
      })

      const client = await createMongoClient({
        url: options.mongoUrl,
        options: options.mongoOptions
      })

      const db = client.db(options.databaseName)

      const locker = new LockManager(db.collection('mongo-locks'))

      await createOrUpdateCollections(db)
      await createIndexes(db)
      await createSeedData(db)

      server.logger.info({
        message: `MongoDb connected to ${options.databaseName}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.DB,
          action: LOGGING_EVENT_ACTIONS.CONNECTION_SUCCESS
        }
      })

      server.decorate('server', 'mongoClient', client)
      server.decorate('server', 'db', db)
      server.decorate('server', 'locker', locker)
      // add coverage
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
          // add coverage
          /* c8 ignore start */
        } catch (err) {
          server.logger.error({
            error: err,
            message: 'Failed to close mongo client',
            event: {
              category: LOGGING_EVENT_CATEGORIES.DB,
              action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING_FAILURE
            }
          })
        }
        /* c8 ignore stop */
      })
    }
  }
}
