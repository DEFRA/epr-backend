import { createInMemoryPublicRegisterRepository } from '#adapters/repositories/public-register/inmemory.js'
import { registerRepository } from './register-repository.js'

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
