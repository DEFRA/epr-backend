import { StatusCodes } from 'http-status-codes'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const organisationsGetAllPath = '/v1/organisations'

export const organisationsGetAll = {
  method: 'GET',
  path: organisationsGetAllPath,
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async ({ organisationsRepository }, h) => {
    const organisations = await organisationsRepository.findAll()

    return h.response(organisations).code(StatusCodes.OK)
  }
}
