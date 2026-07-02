import { createInMemoryUploadsRepository } from './inmemory.js'
import { registerDependency } from '#plugins/register-dependency.js'

/**
 * @param {Object} [config]
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createInMemoryUploadsRepositoryPlugin(config) {
  const repository = createInMemoryUploadsRepository(config)

  return {
    name: 'uploadsRepository',
    register: (server) => {
      registerDependency(server, 'uploadsRepository', () => repository)
    }
  }
}
