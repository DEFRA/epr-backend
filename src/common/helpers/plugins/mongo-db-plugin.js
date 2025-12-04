import { createMongoClient } from '#common/helpers/mongo-client.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { config } from '#root/config.js'
import { LockManager } from 'mongo-locks'
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
     * @param {import('../../hapi-types.js').HapiServer} server
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

      const isProduction = () => true || config.get('cdpEnvironment') === 'prod'

      await createOrUpdateCollections(db)
      await createIndexes(db)

      await createSeedData(
        db,
        isProduction,
        createOrganisationsRepository(db)()
      )

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
            error: err,
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
