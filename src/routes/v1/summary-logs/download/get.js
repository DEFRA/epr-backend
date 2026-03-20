import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'

import { ROLES } from '#common/helpers/auth/constants.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#adapters/repositories/summary-log-files/port.js').SummaryLogFilesRepository} SummaryLogFilesRepository */

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
   *   summaryLogsRepository: SummaryLogsRepository,
   *   summaryLogFilesRepository: SummaryLogFilesRepository
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { summaryLogsRepository, summaryLogFilesRepository } = request
    const { summaryLogId } = request.params

    const result = await summaryLogsRepository.findById(summaryLogId)

    if (!result?.summaryLog?.file?.uri) {
      throw Boom.notFound('Summary log file not found')
    }

    const presignedUrl = await summaryLogFilesRepository.getDownloadUrl(
      result.summaryLog.file.uri
    )

    return h.response(presignedUrl).code(StatusCodes.OK)
  }
}
