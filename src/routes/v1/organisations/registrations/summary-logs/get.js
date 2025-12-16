import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { reconcileWithCdpUploader } from '#adapters/cdp-uploader/reconcile.js'
import {
  getDefaultStatus,
  SUMMARY_LOG_STATUS
} from '#domain/summary-logs/status.js'
import { transformValidationResponse } from './transform-validation-response.js'
import { summaryLogResponseSchema } from './response.schema.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('#adapters/cdp-uploader/status.js').CdpUploader} CdpUploader */

export const summaryLogsGetPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}'

export const summaryLogsGet = {
  method: 'GET',
  path: summaryLogsGetPath,
  options: {
    auth: getAuthConfig([ROLES.standardUser]),
    validate: {
      query: Joi.object({
        uploadId: Joi.string().optional()
      })
    },
    response: {
      schema: summaryLogResponseSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {summaryLogsRepository: SummaryLogsRepository, organisationsRepository: OrganisationsRepository, cdpUploader: CdpUploader}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      summaryLogsRepository,
      organisationsRepository,
      cdpUploader,
      params,
      query
    } = request
    const { summaryLogId, organisationId, registrationId } = params
    const { uploadId } = query

    const result = await summaryLogsRepository.findById(summaryLogId)

    if (!result) {
      return h.response({ status: getDefaultStatus() }).code(StatusCodes.OK)
    }

    // Check CDP Uploader status if stuck in preprocessing and uploadId provided
    const needsReconciliation =
      result.summaryLog.status === SUMMARY_LOG_STATUS.PREPROCESSING && uploadId

    const reconciledSummaryLog = needsReconciliation
      ? await reconcileWithCdpUploader({
          summaryLogId,
          uploadId,
          summaryLogsRepository,
          cdpUploader
        })
      : null

    const summaryLog = reconciledSummaryLog
      ? { ...result.summaryLog, ...reconciledSummaryLog }
      : result.summaryLog

    const response = {
      status: summaryLog.status,
      ...transformValidationResponse(summaryLog.validation)
    }

    if (summaryLog.loads) {
      response.loads = summaryLog.loads
    }

    // Add accreditation number if status is SUBMITTED
    if (summaryLog.status === SUMMARY_LOG_STATUS.SUBMITTED) {
      const registration = await organisationsRepository.findRegistrationById(
        organisationId,
        registrationId
      )

      response.accreditationNumber =
        registration?.accreditation?.accreditationNumber ?? null
    }

    return h.response(response).code(StatusCodes.OK)
  }
}
