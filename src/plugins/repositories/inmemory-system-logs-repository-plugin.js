import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { registerRepository } from './register-repository.js'

/** @returns {{ plugin: import('@hapi/hapi').Plugin<void>, repository: import('#repositories/system-logs/port.js').SystemLogsRepository }} */
export function createInMemorySystemLogsRepositoryPlugin() {
  const factory = createSystemLogsRepository()
  const repository = factory()

  const plugin = {
    name: 'systemLogsRepository',
    register: (server) => {
      registerRepository(server, 'systemLogsRepository', () => factory())
    }
  }

  return { plugin, repository }
}
