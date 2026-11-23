import Boom from '@hapi/boom'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { OrganisationAdministrationRepository } from '#repositories/organisations/administration-port.js' */

/**
 * @param {Pick<OrganisationAdministrationRepository, 'findById'>} organisations
 * @param {string} organisationId
 * @param {string} accreditationId
 * @param {number} [minimumOrgVersion]
 * @returns {Promise<Accreditation>}
 */
export const findAccreditationById = async (
  organisations,
  organisationId,
  accreditationId,
  minimumOrgVersion
) => {
  const org = await organisations.findById(organisationId, minimumOrgVersion)
  const accreditation = org.accreditations?.find(
    (a) => a.id === accreditationId
  )

  if (!accreditation) {
    throw Boom.notFound(`Accreditation with id ${accreditationId} not found`)
  }

  return accreditation
}
