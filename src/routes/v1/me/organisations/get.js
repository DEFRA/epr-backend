import { ROLES } from '#common/helpers/auth/constants.js'
import { StatusCodes } from 'http-status-codes'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const organisationsLinkedGetAllPath = '/v1/me/organisations'

export const organisationsLinkedGetAll = {
  method: 'GET',
  path: organisationsLinkedGetAllPath,
  options: {
    auth: {
      scope: [ROLES.standardUser]
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationsRepository, auth } = request

    const userEmail = auth.credentials.email

    const allOrganisations = await organisationsRepository.findAll()

    // Filter to only organisations where user's email exists in users array
    const userOrganisations = allOrganisations.filter((org) =>
      org.users?.some((user) => user.email === userEmail)
    )

    // Split based on linkedDefraOrganisation field
    const linked = userOrganisations.filter(
      (org) => org.linkedDefraOrganisation
    )
    const unlinked = userOrganisations.filter(
      (org) => !org.linkedDefraOrganisation
    )

    return h
      .response({ organisations: { linked, unlinked } })
      .code(StatusCodes.OK)
  }
}
