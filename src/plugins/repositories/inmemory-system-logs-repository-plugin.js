import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { registerRepository } from './register-repository.js'

/** @returns {import('@hapi/hapi').Plugin<void>} */
export function createInMemorySystemLogsRepositoryPlugin() {
  const factory = createSystemLogsRepository()

  return {
    name: 'systemLogsRepository',
    register: (server) => {
      registerRepository(server, 'systemLogsRepository', () => factory())
    }
  }
}
