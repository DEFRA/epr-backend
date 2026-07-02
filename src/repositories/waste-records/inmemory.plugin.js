import { createInMemoryWasteRecordsRepository } from './inmemory.js'
import { registerDependency } from '#plugins/register-dependency.js'

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
      registerDependency(server, 'wasteRecordsRepository', () => repository)
    }
  }
}
