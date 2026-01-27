import { createInMemoryPublicRegisterRepository } from '#adapters/repositories/public-register/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * Creates an in-memory public register repository plugin for testing.
 * Returns both the plugin (for server registration) and the repository
 * (for direct test access to insert/query data).
 *
 * @param {Object} [config] - Optional configuration
 * @returns {{ plugin: import('@hapi/hapi').Plugin<void>, repository: import('#adapters/repositories/public-register/port.js').PublicRegisterRepository }}
 */
export function createInMemoryPublicRegisterRepositoryPlugin(config) {
  const repository = createInMemoryPublicRegisterRepository(config)

  const plugin = {
    name: 'publicRegisterRepository',
    register: (server) => {
      registerRepository(server, 'publicRegisterRepository', () => repository)
    }
  }

  return { plugin, repository }
}
