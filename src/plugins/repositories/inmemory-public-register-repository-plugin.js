import { createInMemoryPublicRegisterRepository } from '#adapters/repositories/public-register/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * @typedef {Object} InMemoryPublicRegisterRepositoryPluginOptions
 * @property {Object} [config] - Optional configuration
 */

/**
 * In-memory public register repository adapter plugin for testing.
 * Registers the public register repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * This is a stateless repository - the same instance is used for all requests.
 */
export const inMemoryPublicRegisterRepositoryPlugin = {
  name: 'publicRegisterRepository',
  version: '1.0.0',

  /**
   * @param {import('@hapi/hapi').Server} server
   * @param {InMemoryPublicRegisterRepositoryPluginOptions} [options]
   */
  register: (server, options = {}) => {
    // Note: createInMemoryPublicRegisterRepository returns the repo directly, not a factory
    const repository = createInMemoryPublicRegisterRepository(options.config)

    registerRepository(server, 'publicRegisterRepository', () => repository)
  }
}
