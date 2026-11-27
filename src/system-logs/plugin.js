import { portAdapter } from '#plugins/port-adapter.js'
import { createSystemLogsRepository } from './repository/mongodb.js'
import { systemLogsGetSearch } from './routes/get-search.js'

/**
 * The system logs module's production plugins.
 *
 * @module system-logs/plugin
 */

/** The MongoDB adapter for the system logs repository. */
export const systemLogsRepositoryPlugin = portAdapter({
  provides: 'systemLogsRepository',
  needs: ['mongodb'],
  build: async (_options, { mongodb }) => {
    const createRepository = await createSystemLogsRepository(mongodb)
    return ({ logger }) => createRepository(logger)
  }
})

/** The system logs module's routes. */
export const systemLogsRoutesPlugin = {
  name: 'system-logs-routes',
  dependencies: ['systemLogsRepository', 'organisationsRepository'],
  /** @param {import('#common/hapi-types.js').HapiServer} server */
  register: (server) => {
    server.route([systemLogsGetSearch])
  }
}
