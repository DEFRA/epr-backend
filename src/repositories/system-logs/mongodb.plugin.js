import { createSystemLogsRepository } from './mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'

export const mongoSystemLogsRepositoryPlugin = {
  name: 'systemLogsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const repository = await createSystemLogsRepository(
      server.db,
      server.logger
    )

    registerRepository(server, 'systemLogsRepository', () => repository)
  }
}
