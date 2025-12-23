import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  SUMMARY_LOG_STATUS,
  NO_PRIOR_SUBMISSION,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import { summaryLogResponseSchema } from '../response.schema.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { auditSummaryLogSubmit } from '#root/auditing/summary-logs.js'
import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor} SummaryLogsCommandExecutor */
/** @typedef {import('#common/hapi-types.js').TypedLogger} TypedLogger */

/**
 * Checks if the summary log's preview is stale and handles the superseded transition
 * @param {SummaryLogsRepository} summaryLogsRepository
 * @param {object} summaryLog
 * @param {string} summaryLogId
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {number} version
 * @returns {Promise<boolean>} true if stale (superseded), false if valid
 */
async function handleStalenessCheck(
  summaryLogsRepository,
  summaryLog,
  summaryLogId,
  organisationId,
  registrationId,
  version
) {
  const currentLatest =
    await summaryLogsRepository.findLatestSubmittedForOrgReg(
      organisationId,
      registrationId
    )

  const baseline = summaryLog.validatedAgainstSummaryLogId
  const current = currentLatest?.id ?? NO_PRIOR_SUBMISSION

  if (baseline !== current) {
    await summaryLogsRepository.update(
      summaryLogId,
      version,
      transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUPERSEDED)
    )
    const processingType =
      summaryLog.meta?.[SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]
    await summaryLogMetrics.recordStatusTransition(
      SUMMARY_LOG_STATUS.SUPERSEDED,
      processingType
    )
    return true
  }

  return false
}

export const summaryLogsSubmitPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}/submit'

export const summaryLogsSubmit = {
  method: 'POST',
  path: summaryLogsSubmitPath,
  options: {
    auth: getAuthConfig([ROLES.standardUser]),
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

      const isStale = await handleStalenessCheck(
        summaryLogsRepository,
        summaryLog,
        summaryLogId,
        organisationId,
        registrationId,
        newVersion
      )

      if (isStale) {
        throw Boom.conflict(
          'Waste records have changed since preview was generated. Please re-upload.'
        )
      }

      // Trigger async submission worker (fire-and-forget)
      await summaryLogsWorker.submit(summaryLogId)

      const processingType =
        summaryLog.meta?.[SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]
      await summaryLogMetrics.recordStatusTransition(
        SUMMARY_LOG_STATUS.SUBMITTING,
        processingType
      )
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
