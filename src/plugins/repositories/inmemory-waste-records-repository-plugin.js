import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * @param {Object[]} [initialRecords]
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
