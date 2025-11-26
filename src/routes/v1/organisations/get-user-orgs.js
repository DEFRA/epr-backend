import { StatusCodes } from 'http-status-codes'
import { organisationsDiscoveryPath } from '#domain/organisations/paths.js'

async function getUsersOrgsFromToken(tokenPayload, organisationsRepository) {
  const linkedOrganisations =
    await organisationsRepository.findAllByDefraIdOrgId(defraIdOrgId)
  const unlinkedOrganisations =
    await organisationsRepository.findAllUnlinkedOrganisationsByUser({
      email,
      isInitialUser: true
    })

  return {
    all: [...unlinkedOrganisations, ...linkedOrganisations].reduce(
      (prev, organisation) =>
        prev.find(({ id }) => id === organisation.id)
          ? prev
          : [...prev, organisation],
      []
    ),
    unlinked: unlinkedOrganisations,
    linked: linkedOrganisations
  }
}

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const organisationsGetAll = {
  method: 'GET',
  path: organisationsDiscoveryPath,
  options: {
    auth: {
      scope: []
    }
  },

  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { email } = request.auth.credentials
    const { linkedEprOrg, userOrgs } = getUsersOrganisationInfo(
      { email },
      request.organisationsRepository
    )

    // Any reason not to always return a 200?
    return h.response({ linkedEprOrg, userOrgs }).code(StatusCodes.OK)
  }
}
