import { createInMemoryPublicRegisterRepository } from '#adapters/repositories/public-register/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * @param {Object} [config]
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
