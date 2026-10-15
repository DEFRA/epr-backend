import { createSystemLogsRepository } from './inmemory.js'
import { registerDependency } from '#plugins/register-dependency.js'

/** @returns {import('@hapi/hapi').Plugin<void>} */
export function createInMemorySystemLogsRepositoryPlugin() {
  const factory = createSystemLogsRepository()

  return {
    name: 'systemLogsRepository',
    register: (server) => {
      const repository = factory(server.logger)
      registerDependency(server, 'systemLogsRepository', () => repository)
    }
  }
}
