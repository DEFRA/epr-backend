import Boom from '@hapi/boom'

import { storedOrgId } from '#repositories/organisations/helpers.js'
import { findPage } from '#repositories/organisations/inmemory-find.js'
import { toReadModelOrganisations } from './to-read-model.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { Organisation as StoredOrganisation } from '#domain/organisations/model.js' */
/** @import { ExternalAccreditation } from './to-read-model.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { OrganisationReadRepository } from './port.js' */

/**
 * Holds organisations as the organisations repository returns them, and the
 * external accreditations held for their registrations, and serves them in the
 * read model's shape, as the MongoDB adapter does.
 *
 * It shares the in-memory organisations repository's search through the
 * `#repositories/organisations/inmemory-find.js` import, as the MongoDB
 * adapter shares that repository's reads, so a change to that search changes
 * this one too. Once the read model has its own collection, that import is
 * the place to separate them.
 *
 * `find` filters and counts the stored organisations, then puts the page into
 * the read model's shape. An organisation the model leaves out still counts
 * towards `totalItems`, so its page comes back short.
 *
 * Nothing writes to it, so a version below `minimumVersion` can never arrive.
 *
 * @param {StoredOrganisation[]} [organisations]
 * @param {ExternalAccreditation[]} [externalAccreditations]
 * @returns {(dependencies: {
 *   overseasSitesRepository: Pick<OverseasSitesRepository, 'findByIds'>
 *   logger: Pick<TypedLogger, 'warn'>
 * }) => OrganisationReadRepository}
 */
export const createInMemoryOrganisationReadRepository = (
  organisations = [],
  externalAccreditations = []
) => {
  const stored = structuredClone(organisations)
  const external = structuredClone(externalAccreditations)

  return (dependencies) => ({
    findByOrganisationNumber: async (organisationNumber, minimumVersion) => {
      const found = stored.find(
        ({ orgId }) => orgId === storedOrgId(organisationNumber)
      )
      if (!found) {
        return null
      }
      if (minimumVersion !== undefined && found.version < minimumVersion) {
        throw Boom.internal('Consistency timeout waiting for minimum version')
      }
      const [organisation] = await toReadModelOrganisations(
        [structuredClone(found)],
        structuredClone(external),
        dependencies
      )
      return organisation ?? null
    },

    find: async ({ organisationNumber, ...params }) => {
      const { items, ...page } = findPage(stored, {
        ...params,
        orgId: organisationNumber
      })
      return {
        ...page,
        items: await toReadModelOrganisations(items, [], dependencies)
      }
    }
  })
}
