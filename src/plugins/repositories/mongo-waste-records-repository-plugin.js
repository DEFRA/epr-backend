import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { registerRepository } from './register-repository.js'

/**
 * MongoDB waste records repository adapter plugin.
 * Registers the waste records repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * This is a stateless repository - the same instance is used for all requests.
 */
export const mongoWasteRecordsRepositoryPlugin = {
  name: 'wasteRecordsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  /**
   * @param {import('@hapi/hapi').Server} server
   */
  register: async (server) => {
    const factory = await createWasteRecordsRepository(server.db)
    const repository = factory()

    registerRepository(server, 'wasteRecordsRepository', () => repository)
  }
}
