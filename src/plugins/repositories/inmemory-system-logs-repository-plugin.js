import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * Creates an in-memory system logs repository plugin for testing.
 * Returns both the plugin (for server registration) and the repository
 * (for direct test access to insert/query data).
 *
 * Storage is shared between the test instance and per-request instances.
 *
 * @returns {{ plugin: import('@hapi/hapi').Plugin<void>, repository: import('#repositories/system-logs/port.js').SystemLogsRepository }}
 */
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
