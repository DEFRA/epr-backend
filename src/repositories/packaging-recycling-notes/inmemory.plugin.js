import { createInMemoryPackagingRecyclingNotesRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

/**
 * @param {Object[]} [initialPrns]
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createInMemoryPackagingRecyclingNotesRepositoryPlugin(
  initialPrns
) {
  const factory = createInMemoryPackagingRecyclingNotesRepository(initialPrns)
  const repository = factory()

  return {
    name: 'packagingRecyclingNotesRepository',
    register: (server) => {
      registerRepository(
        server,
        'packagingRecyclingNotesRepository',
        () => repository
      )
    }
  }
}
