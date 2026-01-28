import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * @param {Object[]} [initialRecords]
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createInMemoryWasteRecordsRepositoryPlugin(initialRecords) {
  const factory = createInMemoryWasteRecordsRepository(initialRecords)
  const repository = factory()

  return {
    name: 'wasteRecordsRepository',
    register: (server) => {
      registerRepository(server, 'wasteRecordsRepository', () => repository)
    }
  }
}
