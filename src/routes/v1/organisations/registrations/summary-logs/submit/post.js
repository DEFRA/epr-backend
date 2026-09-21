import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import { summaryLogResponseSchema } from '../response.schema.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { auditSummaryLogSubmit } from '#root/auditing/summary-logs.js'
import { summaryLogMetrics } from '#application/summary-logs/metrics.js'
import { supersedeIfStale } from '#application/summary-logs/supersede-if-stale.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { SummaryLogsCommandExecutor } from '#domain/summary-logs/worker/port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

export const summaryLogsSubmitPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}/submit'

export const summaryLogsSubmit = {
  method: 'POST',
  path: summaryLogsSubmitPath,
  options: {
    auth: getAuthConfig([SCOPES.organisationWrite]),
    response: {
      schema: summaryLogResponseSchema
    },
    tags: ['api']
  },
  /**
   * @param {HapiRequest & {
   *   params: { organisationId: string, registrationId: string, summaryLogId: string },
   *   summaryLogsRepository: SummaryLogsRepository,
   *   summaryLogsWorker: SummaryLogsCommandExecutor,
   *   systemLogsRepository: SystemLogsRepository
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { summaryLogsRepository, summaryLogsWorker, params, logger } = request

    const { summaryLogId, organisationId, registrationId } = params

    try {
      // Atomically transition to submitting - fails if another submission in progress
      const result =
        await summaryLogsRepository.transitionToSubmittingExclusive(
          summaryLogId
        )

      if (!result.success) {
        throw Boom.conflict(
          'Another submission is in progress. Please try again.'
        )
      }

      const { summaryLog, version: newVersion } = result

      const isStale = await supersedeIfStale({
        summaryLogsRepository,
        summaryLog,
        summaryLogId,
        organisationId,
        registrationId,
        version: newVersion
      })

      if (isStale) {
        throw Boom.conflict(
          'Waste records have changed since preview was generated. Please re-upload.'
        )
      }

      // Trigger async submission worker (fire-and-forget)
      await summaryLogsWorker.submit(summaryLogId, request)

      const processingType =
        summaryLog.meta?.[SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]
      await summaryLogMetrics.recordStatusTransition({
        status: SUMMARY_LOG_STATUS.SUBMITTING,
        processingType
      })
      await auditSummaryLogSubmit(request, {
        summaryLogId,
        organisationId,
        registrationId
      })

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
        err: error,
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
