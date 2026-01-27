import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * @param {Object} [config]
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
