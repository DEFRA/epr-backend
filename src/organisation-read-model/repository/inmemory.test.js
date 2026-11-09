import { test } from 'vitest'

import { organisationReadRepositoryOf } from '#vite/helpers/organisation-read-model.js'
import { testOrganisationReadRepositoryContract } from './port.contract.js'

/** @import { OrganisationReadRepositoryContractIt, OrganisationReadRepositoryWith } from './port.contract.js' */

/**
 * Seeds organisations as route tests do, through the in-memory organisations
 * repository, so they are held as that repository stores and returns them.
 */
const it = /** @type {OrganisationReadRepositoryContractIt} */ (
  test.extend({
    // eslint-disable-next-line no-empty-pattern
    organisationReadRepositoryWith: async ({}, use) => {
      /** @type {OrganisationReadRepositoryWith} */
      const organisationReadRepositoryWith = async ({
        organisations,
        overseasSites = [],
        externalAccreditations = [],
        logger
      }) =>
        (
          await organisationReadRepositoryOf(organisations, {
            externalAccreditations,
            overseasSites,
            logger
          })
        )()
      await use(organisationReadRepositoryWith)
    }
  })
)

describe('in-memory organisation read repository', () => {
  testOrganisationReadRepositoryContract(it)
})
