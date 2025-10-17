import { StatusCodes } from 'http-status-codes'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const organisationsGetPath = '/v1/organisations'

export const organisationsGet = {
  method: 'GET',
  path: organisationsGetPath,
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async ({ organisationsRepository }, h) => {
    const organisations = await organisationsRepository.findAll()

    if (!organisations) {
      return h
        .response({ message: 'No organisations found' })
        .code(StatusCodes.NOT_FOUND)
    }

    return h.response(organisations).code(StatusCodes.OK)
  }
}
