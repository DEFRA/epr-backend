import { StatusCodes } from 'http-status-codes'
import { getDefaultStatus } from '#domain/summary-logs/status.js'
import { transformValidationResponse } from './transform-validation-response.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */

export const summaryLogsGetPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}'

export const summaryLogsGet = {
  method: 'GET',
  path: summaryLogsGetPath,
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {summaryLogsRepository: SummaryLogsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async ({ summaryLogsRepository, params }, h) => {
    const { summaryLogId } = params

    const result = await summaryLogsRepository.findById(summaryLogId)

    if (!result) {
      return h.response({ status: getDefaultStatus() }).code(StatusCodes.OK)
    }

    const { summaryLog } = result

    const response = {
      status: summaryLog.status,
      ...transformValidationResponse(summaryLog.validation)
    }

    if (summaryLog.failureReason) {
      response.failureReason = summaryLog.failureReason
    }

    return h.response(response).code(StatusCodes.OK)
  }
}
