import { createInMemoryUploadsRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

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
