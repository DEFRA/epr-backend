import { createMongoClient } from '#common/helpers/mongo-client.js'
import { LockManager } from 'mongo-locks'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../enums/index.js'

/** @import {Db} from 'mongodb' */
/** @import {HapiServer} from '../../hapi-types.js' */

export const mongoDbPlugin = {
  plugin: {
    name: 'mongodb',
    version: '1.0.0',
    /**
     * @param {HapiServer} server
     * @param {{
     *   mongoUrl: string,
     *   mongoOptions: object,
     *   databaseName: string,
     *   createCollections: (db: Db) => Promise<void>,
     *   seedDatabase: (db: Db) => Promise<void>
     * }} options
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

      const locks = db.collection('mongo-locks')
      const locker = new LockManager(locks)

      await options.createCollections(db)
      await locks.createIndex({ id: 1 })
      await options.seedDatabase(db)

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
      server.decorate('request', 'db', /* v8 ignore next */ () => db, {
        apply: true
      })
      server.decorate('request', 'locker', /* v8 ignore next */ () => locker, {
        apply: true
      })

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
          /* v8 ignore next 1 */
        } catch (err) {
          /* v8 ignore next 8 */
          server.logger.error({
            err,
            message: 'Failed to close mongo client',
            event: {
              category: LOGGING_EVENT_CATEGORIES.DB,
              action: LOGGING_EVENT_ACTIONS.CONNECTION_CLOSING_FAILURE
            }
          })
        }
      })
    }
  }
}
