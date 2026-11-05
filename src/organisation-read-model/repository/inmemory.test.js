import { test } from 'vitest'

import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { mapDocumentWithCurrentStatuses } from '#repositories/organisations/helpers.js'
import { createInMemoryOrganisationReadRepository } from './inmemory.js'
import { testOrganisationReadRepositoryContract } from './port.contract.js'

/** @import { OrganisationReadRepositoryContractIt, OrganisationReadRepositoryWith } from './port.contract.js' */

/**
 * The contract gives organisations as they are stored, so they are read back
 * as the organisations repository returns them before this repository holds
 * them.
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
      }) =>
        createInMemoryOrganisationReadRepository(
          organisations.map((/** @type {any} */ { id, ...rest }) =>
            mapDocumentWithCurrentStatuses({ _id: id, ...rest })
          )
        )({
          overseasSitesRepository: createInMemoryOverseasSitesRepository(
            /** @type {any[]} */ (overseasSites)
          )(),
          logger
        })
      await use(organisationReadRepositoryWith)
    }
  })
)

describe('in-memory organisation read repository', () => {
  testOrganisationReadRepositoryContract(it)
})
