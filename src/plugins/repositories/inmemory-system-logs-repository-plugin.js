import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * In-memory system logs repository adapter plugin for testing.
 * Registers the system logs repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * Note: The in-memory version doesn't require a logger, but we still
 * use per-request instantiation to match the MongoDB adapter pattern.
 */
export const inMemorySystemLogsRepositoryPlugin = {
  name: 'systemLogsRepository',
  version: '1.0.0',

  /**
   * @param {import('@hapi/hapi').Server} server
   */
  register: (server) => {
    const factory = createSystemLogsRepository()

    registerRepository(server, 'systemLogsRepository', () => factory())
  }
}
