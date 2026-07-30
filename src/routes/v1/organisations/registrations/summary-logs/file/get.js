import { SCOPES } from '#common/helpers/auth/constants.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { auditSummaryLogDownload } from '#root/auditing/summary-logs.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

export const summaryLogFilePath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}/file'

export const summaryLogFile = {
  method: 'GET',
  path: summaryLogFilePath,
  options: {
    auth: {
      scope: [SCOPES.adminRead]
    },
    tags: ['api', 'admin']
  },
  /**
   * @param {HapiRequest & {
   *   params: { organisationId: string, registrationId: string, summaryLogId: string },
   *   summaryLogsRepository: SummaryLogsRepository,
   *   systemLogsRepository: SystemLogsRepository
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { summaryLogsRepository, logger } = request
    const { organisationId, registrationId, summaryLogId } = request.params

    const { url } = await summaryLogsRepository.getDownloadUrl(summaryLogId)

    await auditSummaryLogDownload(request, {
      summaryLogId,
      organisationId,
      registrationId
    })

    logger.info({
      message: `Summary log file downloaded for summaryLogId: ${summaryLogId}, organisationId: ${organisationId}, registrationId: ${registrationId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
        reference: summaryLogId
      }
    })

    return h.redirect(url).temporary()
  }
}
