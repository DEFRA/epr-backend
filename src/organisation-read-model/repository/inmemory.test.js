import { test } from 'vitest'

import { createInMemoryFutureAccreditationsRepository } from '#future-accreditations/repository/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationReadRepository } from './adapter.js'
import { testOrganisationReadRepositoryContract } from './port.contract.js'

/** @import { OrganisationReadRepositoryContractIt, OrganisationReadRepositoryWith } from './port.contract.js' */
/** @import { TypedLogger } from '#common/hapi-types.js' */

const it = /** @type {OrganisationReadRepositoryContractIt} */ (
  test.extend({
    // eslint-disable-next-line no-empty-pattern
    organisationReadRepositoryWith: async ({}, use) => {
      /** @type {OrganisationReadRepositoryWith} */
      const organisationReadRepositoryWith = async ({
        organisations,
        overseasSites = [],
        futureAccreditations = [],
        logger = { warn: () => {} }
      }) => {
        const futureAccreditationsRepository =
          createInMemoryFutureAccreditationsRepository()()
        await Promise.all(
          futureAccreditations.map(futureAccreditationsRepository.upsert)
        )
        return createOrganisationReadRepository({
          organisationsRepository: createInMemoryOrganisationsRepository(
            /** @type {any[]} */ (organisations)
          )(),
          overseasSitesRepository: createInMemoryOverseasSitesRepository(
            /** @type {any[]} */ (overseasSites)
          )(),
          futureAccreditationsRepository,
          logger: /** @type {TypedLogger} */ (/** @type {unknown} */ (logger))
        })
      }
      await use(organisationReadRepositoryWith)
    }
  })
)

describe('organisation read repository over in-memory repositories', () => {
  testOrganisationReadRepositoryContract(it)
})
