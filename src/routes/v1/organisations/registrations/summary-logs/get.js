import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { getDefaultStatus } from '#domain/summary-logs/status.js'
import { summaryLogResponseSchema } from './response.schema.js'
import { toSummaryLogResponse } from './summary-log-response.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */

export const summaryLogsGetPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}'

export const summaryLogsGet = {
  method: 'GET',
  path: summaryLogsGetPath,
  options: {
    auth: getAuthConfig([SCOPES.organisationRead]),
    tags: ['api'],
    response: {
      schema: summaryLogResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: { organisationId: string, registrationId: string, summaryLogId: string },
   *   summaryLogsRepository: SummaryLogsRepository
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { summaryLogsRepository, params, logger } = request
    const { summaryLogId } = params

    const result = await summaryLogsRepository.findById(summaryLogId)

    if (!result) {
      return h.response({ status: getDefaultStatus() }).code(StatusCodes.OK)
    }

    const response = toSummaryLogResponse(result.summaryLog)

    logger.info({
      message: `Summary log status retrieved: summaryLogId=${summaryLogId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
        reference: summaryLogId
      }
    })

    return h.response(response).code(StatusCodes.OK)
  }
}
