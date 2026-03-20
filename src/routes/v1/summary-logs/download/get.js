import { StatusCodes } from 'http-status-codes'

import { ROLES } from '#common/helpers/auth/constants.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */

export const summaryLogDownloadPath = '/v1/summary-logs/{summaryLogId}/download'

export const summaryLogDownload = {
  method: 'GET',
  path: summaryLogDownloadPath,
  options: {
    auth: {
      scope: [ROLES.serviceMaintainer]
    },
    tags: ['api', 'admin']
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   summaryLogsRepository: SummaryLogsRepository
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { summaryLogsRepository } = request
    const { summaryLogId } = request.params

    const downloadUrl = await summaryLogsRepository.getDownloadUrl(summaryLogId)

    return h.response(downloadUrl).code(StatusCodes.OK)
  }
}
