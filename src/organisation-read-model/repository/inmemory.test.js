import { test } from 'vitest'

import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { mapDocumentWithCurrentStatuses } from '#repositories/organisations/helpers.js'
import { createInMemoryOrganisationReadRepository } from './inmemory.js'
import { testOrganisationReadRepositoryContract } from './port.contract.js'
import { toReadModelOrganisations } from './to-read-model.js'

/** @import { OrganisationReadRepositoryContractIt, OrganisationReadRepositoryWith } from './port.contract.js' */

/**
 * The contract stores organisations as the organisations repository does, so
 * they are put into the read model's shape before the repository holds them.
 */
const it = /** @type {OrganisationReadRepositoryContractIt} */ (
  test.extend({
    // eslint-disable-next-line no-empty-pattern
    organisationReadRepositoryWith: async ({}, use) => {
      /** @type {OrganisationReadRepositoryWith} */
      const organisationReadRepositoryWith = async ({
        organisations,
        overseasSites = [],
        logger = { warn: () => {} }
      }) => {
        const readModel = await toReadModelOrganisations(
          organisations.map((/** @type {any} */ { id, ...rest }) =>
            mapDocumentWithCurrentStatuses({ _id: id, ...rest })
          ),
          {
            overseasSitesRepository: createInMemoryOverseasSitesRepository(
              /** @type {any[]} */ (overseasSites)
            )(),
            logger
          }
        )
        return createInMemoryOrganisationReadRepository(readModel)()
      }
      await use(organisationReadRepositoryWith)
    }
  })
)

describe('in-memory organisation read repository', () => {
  testOrganisationReadRepositoryContract(it)
})
