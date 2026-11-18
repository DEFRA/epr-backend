/** @import {SummaryLogId} from '#domain/summary-logs/ids.js' */
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import { summaryLogSubmitResponseSchema } from '../response.schema.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { auditSummaryLogSubmit } from '#root/auditing/summary-logs.js'
import { summaryLogMetrics } from '#application/summary-logs/metrics.js'
import {
  staleSubmissionConflict,
  supersedeIfStale
} from '#application/summary-logs/supersede-if-stale.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { SummaryLogsCommandExecutor } from '#domain/summary-logs/worker/port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { RegistrationParams } from '#routes/organisations/natural-keys.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */

/**
 * @typedef {HapiRequest & {
 *   params: RegistrationParams & { summaryLogId: SummaryLogId },
 *   summaryLogsRepository: SummaryLogsRepository,
 *   organisationReadRepository: OrganisationReadRepository,
 *   summaryLogsWorker: SummaryLogsCommandExecutor,
 *   systemLogsRepository: SystemLogsRepository
 * }} SummaryLogsSubmitRequest
 */

const FAILURE_MESSAGE = 'Failure submitting summary log'

/**
 * Moves the summary log to submitting, unless another submission is in
 * progress or it can no longer be committed as validated.
 *
 * @param {Pick<SummaryLogsSubmitRequest, 'summaryLogsRepository' | 'organisationReadRepository' | 'logger'>} request
 * @param {SummaryLogId} summaryLogId
 */
const startSubmitting = async (
  { summaryLogsRepository, organisationReadRepository, logger },
  summaryLogId
) => {
  // Atomically transition to submitting - fails if another submission in progress
  const result =
    await summaryLogsRepository.transitionToSubmittingExclusive(summaryLogId)

  if (!result.success) {
    throw Boom.conflict('Another submission is in progress. Please try again.')
  }

  const { summaryLog, version } = result

  const { reason } = await supersedeIfStale({
    summaryLogsRepository,
    organisationReadRepository,
    logger,
    summaryLog,
    summaryLogId,
    version
  })

  if (reason) {
    throw staleSubmissionConflict(reason)
  }

  return summaryLog
}

export const summaryLogsSubmit = {
  method: 'POST',
  options: {
    auth: getAuthConfig([SCOPES.organisationWrite]),
    response: {
      schema: summaryLogSubmitResponseSchema
    },
    tags: ['api']
  },
  /**
   * @param {SummaryLogsSubmitRequest} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { summaryLogsWorker, params, logger } = request

    const { summaryLogId, organisationNumber, registrationNumber } = params

    try {
      const summaryLog = await startSubmitting(request, summaryLogId)

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
        organisationNumber,
        registrationNumber,
        accreditationNumber: summaryLog.accreditationNumber
      })

      logger.info({
        message: `Summary log submission initiated: summaryLogId=${summaryLogId}, organisationNumber=${organisationNumber}, registrationNumber=${registrationNumber}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: summaryLogId
        }
      })

      return h
        .response({ status: SUMMARY_LOG_STATUS.SUBMITTING })
        .code(StatusCodes.OK)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: FAILURE_MESSAGE,
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

      throw Boom.badImplementation(FAILURE_MESSAGE)
    }
  }
}
