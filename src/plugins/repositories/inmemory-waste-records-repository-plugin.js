import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * Creates an in-memory waste records repository plugin for testing.
 * Returns both the plugin (for server registration) and the repository
 * (for direct test access to insert/query data).
 *
 * @param {Object[]} [initialRecords] - Initial waste records data
 * @returns {{ plugin: import('@hapi/hapi').Plugin<void>, repository: import('#repositories/waste-records/port.js').WasteRecordsRepository }}
 */
export function createInMemoryWasteRecordsRepositoryPlugin(initialRecords) {
  const factory = createInMemoryWasteRecordsRepository(initialRecords)
  const repository = factory()

  const plugin = {
    name: 'wasteRecordsRepository',
    register: (server) => {
      registerRepository(server, 'wasteRecordsRepository', () => repository)
    }
  }

  return { plugin, repository }
}
