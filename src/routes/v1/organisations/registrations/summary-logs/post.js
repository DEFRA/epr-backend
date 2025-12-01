import { randomUUID } from 'node:crypto'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { config } from '#root/config.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { summaryLogsCreatePayloadSchema } from './post.schema.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#domain/uploads/repository/port.js').UploadsRepository} UploadsRepository */

export const summaryLogsCreatePath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs'

export const summaryLogsCreate = {
  method: 'POST',
  path: summaryLogsCreatePath,
  options: {
    auth: false,
    validate: {
      payload: summaryLogsCreatePayloadSchema,
      failAction: (_request, _h, err) => {
        throw Boom.badData(err.message)
      }
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {summaryLogsRepository: SummaryLogsRepository, uploadsRepository: UploadsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      summaryLogsRepository,
      uploadsRepository,
      params,
      payload,
      logger
    } = request
    const { organisationId, registrationId } = params
    const { redirectUrl } = payload

    const summaryLogId = randomUUID()
    const resolvedRedirectUrl = redirectUrl.replace(
      '{summaryLogId}',
      summaryLogId
    )
    const eprBackendUrl = config.get('eprBackendUrl')
    const callbackUrl = `${eprBackendUrl}/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`

    try {
      // Create summary log with preprocessing status
      await summaryLogsRepository.insert(summaryLogId, {
        status: SUMMARY_LOG_STATUS.PREPROCESSING,
        organisationId,
        registrationId
      })

      // Initiate upload via CDP Uploader
      const cdpResponse = await uploadsRepository.initiateSummaryLogUpload({
        organisationId,
        registrationId,
        summaryLogId,
        redirectUrl: resolvedRedirectUrl,
        callbackUrl
      })

      logger.info({
        message: `Summary log initiated: summaryLogId=${summaryLogId}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: summaryLogId
        }
      })

      return h
        .response({
          summaryLogId,
          uploadId: cdpResponse.uploadId,
          uploadUrl: cdpResponse.uploadUrl,
          statusUrl: cdpResponse.statusUrl
        })
        .code(StatusCodes.CREATED)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        error,
        message: `Failure on ${summaryLogsCreatePath}`,
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

      throw Boom.badImplementation(`Failure on ${summaryLogsCreatePath}`)
    }
  }
}
