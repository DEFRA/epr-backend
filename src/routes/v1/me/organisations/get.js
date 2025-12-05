import { ROLES } from '#common/helpers/auth/constants.js'
import { StatusCodes } from 'http-status-codes'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const organisationsLinkedGetAllPath = '/v1/me/organisations'

export const organisationsLinkedGetAll = {
  method: 'GET',
  path: organisationsLinkedGetAllPath,
  options: {
    auth: {
      scope: [ROLES.inquirer]
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationsRepository, auth } = request

    const { contactId, email } = auth.credentials

    const allOrganisations = await organisationsRepository.findAll()

    // Filter to only organisations where user's email/contact-id exists in users array
    const userOrganisations = allOrganisations.filter((org) =>
      org.users?.some(
        (user) => user.contactId === contactId || user.email === email
      )
    )

    // Split based on linkedDefraOrganisation field
    const linked = userOrganisations.filter(
      (org) => org.linkedDefraOrganisation
    )
    const unlinked = userOrganisations.filter(
      (org) => !org.linkedDefraOrganisation
    )

    console.log('userOrganisations :>> ', userOrganisations)
    console.log('linked :>> ', linked)
    console.log('unlinked :>> ', unlinked)

    return h
      .response({ organisations: { linked, unlinked } })
      .code(StatusCodes.OK)
  }
}
