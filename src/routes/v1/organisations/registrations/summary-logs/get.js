import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { getDefaultStatus } from '#domain/summary-logs/status.js'
import { extractResponseMetaFields } from '#domain/summary-logs/extract-response-meta-fields.js'
import { transformValidationResponse } from './transform-validation-response.js'
import { summaryLogResponseSchema } from './response.schema.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */

export const summaryLogsGetPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}'

export const summaryLogsGet = {
  method: 'GET',
  path: summaryLogsGetPath,
  options: {
    auth: getAuthConfig([ROLES.standardUser]),
    tags: ['api'],
    response: {
      schema: summaryLogResponseSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {summaryLogsRepository: SummaryLogsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { summaryLogsRepository, params, logger } = request
    const { summaryLogId } = params

    const result = await summaryLogsRepository.findById(summaryLogId)

    if (!result) {
      return h.response({ status: getDefaultStatus() }).code(StatusCodes.OK)
    }

    const { summaryLog } = result

    const response = {
      status: summaryLog.status,
      ...transformValidationResponse(summaryLog.validation),
      ...(summaryLog.loads && { loads: summaryLog.loads }),
      ...(summaryLog.loadsByWasteRecordType && {
        loadsByWasteRecordType: summaryLog.loadsByWasteRecordType
      }),
      ...extractResponseMetaFields(summaryLog.meta)
    }

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
