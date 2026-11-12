import { findPage } from '#repositories/organisations/inmemory-find.js'

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationReadRepository } from './port.js' */

/**
 * What the organisations repository's search reads, taken from an
 * organisation in the read model's shape, with the organisation alongside.
 *
 * @param {Organisation} organisation
 */
const searchable = (organisation) => ({
  organisationNumber: organisation.organisationNumber,
  companyDetails: { name: organisation.name },
  registrations: Object.keys(organisation.registrations).map(
    (registrationNumber) => ({ registrationNumber })
  ),
  accreditations: Object.values(organisation.registrations).flatMap(
    (registration) =>
      Object.values(registration.accreditations).map(
        ({ accreditationNumber }) => ({ accreditationNumber })
      )
  ),
  organisation
})

/**
 * Holds organisations already in the read model's shape, and serves them as
 * given. It ignores `findByOrganisationNumber`'s `year`: a test asking for a
 * year seeds the organisation as it stood in that year.
 *
 * It shares the in-memory organisations repository's search through the
 * `#repositories/organisations/inmemory-find.js` import, so both match
 * criteria the same way. Unlike the MongoDB adapter, which searches and
 * counts organisations as they are stored, it searches what the read model
 * serves: what the model leaves out is neither found nor counted, and an
 * external accreditation is both found by `find` and served from it.
 *
 * @param {Organisation[]} [organisations]
 * @returns {() => OrganisationReadRepository}
 */
export const createInMemoryOrganisationReadRepository = (
  organisations = []
) => {
  const held = structuredClone(organisations)

  return () => ({
    findByOrganisationNumber: async (organisationNumber) => {
      const found = held.find(
        (candidate) => candidate.organisationNumber === organisationNumber
      )
      if (!found) {
        return null
      }
      return structuredClone(found)
    },

    find: async (params) => {
      const { items, ...page } = findPage(held.map(searchable), params)
      return { ...page, items: items.map(({ organisation }) => organisation) }
    },

    findAll: async () => structuredClone(held)
  })
}
