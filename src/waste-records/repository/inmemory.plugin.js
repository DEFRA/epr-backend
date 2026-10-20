import { createInMemorySummaryLogRowStatesRepository } from './inmemory.js'
import { registerDependency } from '#plugins/register-dependency.js'

/** @import { ServerApp } from '#common/hapi-types.js' */

/** @returns {import('@hapi/hapi').Plugin<void>} */
export function createInMemorySummaryLogRowStatesRepositoryPlugin() {
  return {
    name: 'summaryLogRowStatesRepository',
    dependencies: ['organisationsRepository'],
    register: (server) => {
      const { organisationsRepository } = /** @type {ServerApp} */ (server.app)
      const repository = createInMemorySummaryLogRowStatesRepository(
        [],
        organisationsRepository
      )()
      registerDependency(
        server,
        'summaryLogRowStatesRepository',
        () => repository
      )
    }
  }
}
