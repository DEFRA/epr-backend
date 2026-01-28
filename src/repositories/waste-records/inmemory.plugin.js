import { createInMemoryWasteRecordsRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

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
