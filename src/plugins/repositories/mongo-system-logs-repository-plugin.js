import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { registerRepository } from './register-repository.js'

/**
 * MongoDB system logs repository adapter plugin.
 * Registers the system logs repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * This repository requires per-request instantiation because it needs
 * the request's logger for error logging. The repository is lazily
 * created on first access and cached for the duration of the request.
 */
export const mongoSystemLogsRepositoryPlugin = {
  name: 'systemLogsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  /**
   * @param {import('@hapi/hapi').Server} server
   */
  register: async (server) => {
    const factory = await createSystemLogsRepository(server.db)

    registerRepository(server, 'systemLogsRepository', (request) =>
      factory(request.logger)
    )
  }
}
