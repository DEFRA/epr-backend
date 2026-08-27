import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { summaryLogDocumentResponseSchema } from './response.schema.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */

export const summaryLogDocumentPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}/document'

export const summaryLogDocument = {
  method: 'GET',
  path: summaryLogDocumentPath,
  options: {
    auth: {
      scope: [SCOPES.adminRead]
    },
    tags: ['api', 'admin'],
    response: {
      schema: summaryLogDocumentResponseSchema
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
      throw Boom.notFound(`Summary log with id ${summaryLogId} not found`)
    }

    const { version, summaryLog } = result

    logger.info({
      message: `Summary log document retrieved: summaryLogId=${summaryLogId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
        reference: summaryLogId
      }
    })

    return h.response({ version, ...summaryLog }).code(StatusCodes.OK)
  }
}
