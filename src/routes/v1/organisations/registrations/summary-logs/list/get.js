import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'
import { ROLES } from '#common/helpers/auth/constants.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { summaryLogsListResponseSchema } from './response.schema.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */

export const summaryLogsListPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs'

export const summaryLogsList = {
  method: 'GET',
  path: summaryLogsListPath,
  options: {
    auth: {
      scope: [ROLES.serviceMaintainer]
    },
    tags: ['api', 'admin'],
    response: {
      schema: summaryLogsListResponseSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {summaryLogsRepository: SummaryLogsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { summaryLogsRepository, params, logger } = request
    const { organisationId, registrationId } = params

    try {
      const summaryLogs = await summaryLogsRepository.findAllByOrgReg(
        organisationId,
        registrationId
      )

      const summaryLogList = summaryLogs.map(({ id, summaryLog }) => ({
        summaryLogId: id,
        filename: summaryLog.file.name,
        uploadedAt: summaryLog.submittedAt ?? summaryLog.createdAt,
        status: summaryLog.status
      }))

      logger.info({
        message: `Summary log list retrieved: organisationId=${organisationId}, registrationId=${registrationId}, count=${summaryLogs.length}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      return h.response({ summaryLogs: summaryLogList }).code(StatusCodes.OK)
    } catch (error) {
      logger.error({
        err: error,
        message: `Failure on ${summaryLogsListPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        },
        http: {
          response: {
            status_code: StatusCodes.INTERNAL_SERVER_ERROR
          }
        }
      })

      throw Boom.badImplementation(`Failure on ${summaryLogsListPath}`)
    }
  }
}
