import { createInMemoryPublicRegisterRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

/**
 * @param {Object} [config]
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createInMemoryPublicRegisterRepositoryPlugin(config) {
  const repository = createInMemoryPublicRegisterRepository(config)

  return {
    name: 'publicRegisterRepository',
    register: (server) => {
      registerRepository(server, 'publicRegisterRepository', () => repository)
    }
  }
}
