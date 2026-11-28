import { portAdapter } from '#plugins/port-adapter.js'
import { createInMemoryPackagingRecyclingNotesRepository } from './inmemory.js'

/** @import { PackagingRecyclingNote } from '../domain/model.js' */

/**
 * The in-memory adapter for the PRN repository, which the test server
 * registers.
 *
 * @param {PackagingRecyclingNote[]} [initialPrns]
 */
export function createInMemoryPackagingRecyclingNotesRepositoryPlugin(
  initialPrns
) {
  const factory = createInMemoryPackagingRecyclingNotesRepository(
    initialPrns,
    []
  )

  return portAdapter({
    provides: 'packagingRecyclingNotesRepository',
    needs: [],
    build:
      () =>
      ({ logger }) =>
        factory(logger)
  })
}
