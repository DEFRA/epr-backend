/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

/**
 * The repository holding the accreditations these endpoints serve. When the
 * POC reads accreditations over HTTP, `organisationsRepository` fetches them
 * from these very endpoints, so the endpoints read the repository beneath it.
 *
 * @param {HapiRequest & { localOrganisationsRepository?: OrganisationsRepository }} request
 * @returns {OrganisationsRepository}
 */
export const holdingRepository = (request) =>
  request.localOrganisationsRepository ?? request.organisationsRepository
