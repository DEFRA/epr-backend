import { StatusCodes } from 'http-status-codes'
import { SUMMARY_LOG_STATUS } from '#common/enums/index.js'

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
      return h
        .response({ status: SUMMARY_LOG_STATUS.PREPROCESSING })
        .code(StatusCodes.OK)
    }

    const response = { status: summaryLog.status }

    if (summaryLog.failureReason) {
      response.failureReason = summaryLog.failureReason
    }

    return h.response(response).code(StatusCodes.OK)
  }
}
