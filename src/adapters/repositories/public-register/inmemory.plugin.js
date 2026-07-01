import { createInMemoryPublicRegisterRepository } from './inmemory.js'
import { registerDependency } from '#plugins/register-dependency.js'

/**
 * @param {Object} [config]
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createInMemoryPublicRegisterRepositoryPlugin(config) {
  const repository = createInMemoryPublicRegisterRepository(config)

  return {
    name: 'publicRegisterRepository',
    register: (server) => {
      registerDependency(server, 'publicRegisterRepository', () => repository)
    }
  }
}
