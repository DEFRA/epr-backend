import { describe, it as baseIt } from 'vitest'

import { createInMemoryExternalAccreditationsRepository } from './inmemory.js'
import { testExternalAccreditationsRepositoryContract } from './port.contract.js'

/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */
/** @import { TestAPI } from 'vitest' */
/** @import { ExternalAccreditationsRepository } from './port.js' */

/**
 * @typedef {{
 *   store: ExternalAccreditation[]
 *   externalAccreditationsRepository: ExternalAccreditationsRepository
 *   held: () => Promise<object[]>
 * }} InMemoryFixtures
 */

const it = /** @type {TestAPI<InMemoryFixtures>} */ (
  baseIt.extend({
    // eslint-disable-next-line no-empty-pattern
    store: async (/** @type {object} */ {}, use) => {
      await use([])
    },

    externalAccreditationsRepository: async (
      /** @type {{ store: ExternalAccreditation[] }} */ { store },
      use
    ) => {
      await use(createInMemoryExternalAccreditationsRepository(store)())
    },

    held: async (
      /** @type {{ store: ExternalAccreditation[] }} */ { store },
      use
    ) => {
      await use(async () =>
        structuredClone(store).sort(
          (a, b) =>
            a.registrationNumber.localeCompare(b.registrationNumber) ||
            a.year - b.year
        )
      )
    }
  })
)

describe('in-memory external accreditations repository', () => {
  testExternalAccreditationsRepositoryContract(it)
})
