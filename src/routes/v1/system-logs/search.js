import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'

/** @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository */

export const systemLogsGet = {
  method: 'GET',
  path: '/v1/system-logs',
  options: {
    auth: {
      scope: [ROLES.serviceMaintainer]
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {systemLogsRepository: SystemLogsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async ({ systemLogsRepository, query }, h) => {
    const { organisationId } = query

    const systemLogs =
      await systemLogsRepository.findByOrganisationId(organisationId)

    const responseData = { systemLogs }

    return h.response(responseData).code(StatusCodes.OK)
  }
}
