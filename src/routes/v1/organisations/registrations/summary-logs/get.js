import { HTTP_STATUS } from '#common/enums/http-status.js'

/** @typedef {import('#repositories/summary-logs-repository.port.js').SummaryLogsRepository} SummaryLogsRepository */

export const summaryLogsGetPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}'

export const summaryLogsGet = {
  method: 'GET',
  path: summaryLogsGetPath,
  /**
   * @param {Object} request
   * @param {SummaryLogsRepository} request.summaryLogsRepository
   * @param {Object} request.params
   * @param {Object} h - Hapi response toolkit
   */
  handler: async ({ summaryLogsRepository, params }, h) => {
    const { summaryLogId } = params

    const summaryLog =
      await summaryLogsRepository.findBySummaryLogId(summaryLogId)

    if (!summaryLog) {
      return h.response({ status: 'preprocessing' }).code(HTTP_STATUS.OK)
    }

    if (summaryLog.fileStatus === 'rejected') {
      return h
        .response({
          status: 'rejected',
          failureReason: 'File rejected by virus scan'
        })
        .code(HTTP_STATUS.OK)
    }

    return h.response({ status: 'validating' }).code(HTTP_STATUS.OK)
  }
}
