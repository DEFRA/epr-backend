import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { summaryLogResponseSchema } from '../response.schema.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor} SummaryLogsCommandExecutor */
/** @typedef {import('#common/hapi-types.js').TypedLogger} TypedLogger */

export const summaryLogsSubmitPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}/submit'

export const summaryLogsSubmit = {
  method: 'POST',
  path: summaryLogsSubmitPath,
  options: {
    response: {
      schema: summaryLogResponseSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {summaryLogsRepository: SummaryLogsRepository} & {summaryLogsWorker: SummaryLogsCommandExecutor}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { summaryLogsRepository, summaryLogsWorker, params, logger } = request

    const { summaryLogId, organisationId, registrationId } = params

    try {
      // Load the summary log
      const existing = await summaryLogsRepository.findById(summaryLogId)

      if (!existing) {
        throw Boom.notFound(`Summary log ${summaryLogId} not found`)
      }

      const { summaryLog, version } = existing

      // Verify status is VALIDATED
      if (summaryLog.status !== SUMMARY_LOG_STATUS.VALIDATED) {
        throw Boom.conflict(
          `Summary log must be validated before submission. Current status: ${summaryLog.status}`
        )
      }

      // Update status to SUBMITTING using optimistic concurrency
      await summaryLogsRepository.update(summaryLogId, version, {
        ...summaryLog,
        status: SUMMARY_LOG_STATUS.SUBMITTING
      })

      // Trigger async submission worker (fire-and-forget)
      await summaryLogsWorker.submit(summaryLogId)

      logger.info({
        message: `Summary log submission initiated: summaryLogId=${summaryLogId}, organisationId=${organisationId}, registrationId=${registrationId}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: summaryLogId
        }
      })

      return h
        .response({ status: SUMMARY_LOG_STATUS.SUBMITTING })
        .code(StatusCodes.OK)
        .header(
          'Location',
          `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`
        )
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        error,
        message: `Failure on ${summaryLogsSubmitPath}`,
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

      throw Boom.badImplementation(`Failure on ${summaryLogsSubmitPath}`)
    }
  }
}
