import { ROLES } from '#common/helpers/auth/constants.js'
import { auditSummaryLogDownload } from '#root/auditing/summary-logs.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */

export const summaryLogDownloadPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}/download'

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
    const { organisationId, registrationId, summaryLogId } = request.params

    const { url } = await summaryLogsRepository.getDownloadUrl(summaryLogId)

    await auditSummaryLogDownload(request, {
      summaryLogId,
      organisationId,
      registrationId
    })

    return h.redirect(url).temporary()
  }
}
