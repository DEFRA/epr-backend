import { StatusCodes } from 'http-status-codes'
import {
  getDefaultStatus,
  SUMMARY_LOG_STATUS
} from '#domain/summary-logs/status.js'
import { transformValidationResponse } from './transform-validation-response.js'
import { summaryLogResponseSchema } from './response.schema.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const summaryLogsGetPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}'

export const summaryLogsGet = {
  method: 'GET',
  path: summaryLogsGetPath,
  options: {
    auth: false,
    response: {
      schema: summaryLogResponseSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {summaryLogsRepository: SummaryLogsRepository, organisationsRepository: OrganisationsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (
    { summaryLogsRepository, organisationsRepository, params },
    h
  ) => {
    const { summaryLogId, organisationId, registrationId } = params

    const result = await summaryLogsRepository.findById(summaryLogId)

    if (!result) {
      return h.response({ status: getDefaultStatus() }).code(StatusCodes.OK)
    }

    const { summaryLog } = result

    const response = {
      status: summaryLog.status,
      ...transformValidationResponse(summaryLog.validation)
    }

    if (summaryLog.failureReason) {
      response.failureReason = summaryLog.failureReason
    }

    // Add accreditation number if status is SUBMITTED
    if (summaryLog.status === SUMMARY_LOG_STATUS.SUBMITTED) {
      try {
        const registration = await organisationsRepository.findRegistrationById(
          organisationId,
          registrationId
        )

        response.accreditationNumber =
          registration?.accreditation?.accreditationNumber ?? null
      } catch {
        // Registration not found - return null for accreditation number
        response.accreditationNumber = null
      }
    }

    return h.response(response).code(StatusCodes.OK)
  }
}
