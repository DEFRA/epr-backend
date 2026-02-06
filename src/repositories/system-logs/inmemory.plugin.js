import { createSystemLogsRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

/** @returns {import('@hapi/hapi').Plugin<void>} */
export function createInMemorySystemLogsRepositoryPlugin() {
  return {
    name: 'systemLogsRepository',
    register: (server) => {
      const repository = createSystemLogsRepository(server.logger)

      registerRepository(server, 'systemLogsRepository', () => repository)
    }
  }
}
