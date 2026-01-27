import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * @typedef {Object} InMemoryWasteRecordsRepositoryPluginOptions
 * @property {Object[]} [initialRecords] - Initial waste records data
 */

/**
 * In-memory waste records repository adapter plugin for testing.
 * Registers the waste records repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * This is a stateless repository - the same instance is used for all requests.
 */
export const inMemoryWasteRecordsRepositoryPlugin = {
  name: 'wasteRecordsRepository',
  version: '1.0.0',

  /**
   * @param {import('@hapi/hapi').Server} server
   * @param {InMemoryWasteRecordsRepositoryPluginOptions} [options]
   */
  register: (server, options = {}) => {
    const factory = createInMemoryWasteRecordsRepository(options.initialRecords)
    const repository = factory()

    registerRepository(server, 'wasteRecordsRepository', () => repository)
  }
}
