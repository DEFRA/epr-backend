import { createSystemLogsRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

/** @returns {import('@hapi/hapi').Plugin<void>} */
export function createInMemorySystemLogsRepositoryPlugin() {
  const factory = createSystemLogsRepository()

  return {
    name: 'systemLogsRepository',
    register: (server) => {
      registerRepository(server, 'systemLogsRepository', (request) =>
        factory(request.logger)
      )
    }
  }
}
