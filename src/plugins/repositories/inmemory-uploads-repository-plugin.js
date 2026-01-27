import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * @typedef {Object} InMemoryUploadsRepositoryPluginOptions
 * @property {Object} [config] - Optional configuration
 */

/**
 * In-memory uploads repository adapter plugin for testing.
 * Registers the uploads repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * This is a stateless repository - the same instance is used for all requests.
 */
export const inMemoryUploadsRepositoryPlugin = {
  name: 'uploadsRepository',
  version: '1.0.0',

  /**
   * @param {import('@hapi/hapi').Server} server
   * @param {InMemoryUploadsRepositoryPluginOptions} [options]
   */
  register: (server, options = {}) => {
    // Note: createInMemoryUploadsRepository returns the repo directly, not a factory
    const repository = createInMemoryUploadsRepository(options.config)

    registerRepository(server, 'uploadsRepository', () => repository)
  }
}
