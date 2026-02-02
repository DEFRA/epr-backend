import { createSystemLogsRepository } from './mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'

// Per-request instantiation: needs request.logger for error logging.
export const mongoSystemLogsRepositoryPlugin = {
  name: 'systemLogsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const factory = await createSystemLogsRepository(server.db)

    registerRepository(server, 'systemLogsRepository', (request) =>
      factory(request.logger)
    )
  }
}
