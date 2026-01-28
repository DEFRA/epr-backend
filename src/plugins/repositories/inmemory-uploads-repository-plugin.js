import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * @param {Object} [config]
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createInMemoryUploadsRepositoryPlugin(config) {
  const repository = createInMemoryUploadsRepository(config)

  return {
    name: 'uploadsRepository',
    register: (server) => {
      registerRepository(server, 'uploadsRepository', () => repository)
    }
  }
}
