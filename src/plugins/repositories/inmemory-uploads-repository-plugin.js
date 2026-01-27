import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * Creates an in-memory uploads repository plugin for testing.
 * Returns both the plugin (for server registration) and the repository
 * (for direct test access to insert/query data).
 *
 * @param {Object} [config] - Optional configuration
 * @returns {{ plugin: import('@hapi/hapi').Plugin<void>, repository: import('#adapters/repositories/uploads/port.js').UploadsRepository }}
 */
export function createInMemoryUploadsRepositoryPlugin(config) {
  const repository = createInMemoryUploadsRepository(config)

  const plugin = {
    name: 'uploadsRepository',
    register: (server) => {
      registerRepository(server, 'uploadsRepository', () => repository)
    }
  }

  return { plugin, repository }
}
