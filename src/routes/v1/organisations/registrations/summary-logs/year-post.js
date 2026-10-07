import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { checkSummaryLogUploadEligibility } from '#domain/summary-logs/upload-eligibility.js'
import { createSummaryLogUpload } from './create-summary-log-upload.js'
import {
  summaryLogsYearCreateParamsSchema,
  summaryLogsYearCreatePayloadSchema
} from './year-post.schema.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { UploadsRepository } from '#domain/uploads/repository/port.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

/**
 * @typedef {{redirectUrl: string}} SummaryLogsYearCreatePayload
 */

export const summaryLogsYearCreatePath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{year}'

/**
 * Which accreditation the upload belongs to isn't asked for here: it is
 * stamped at upload-completed from the registration's current accreditation
 * link.
 */
export const summaryLogsYearCreate = {
  method: 'POST',
  path: summaryLogsYearCreatePath,
  options: {
    auth: getAuthConfig([SCOPES.organisationWrite]),
    tags: ['api'],
    validate: {
      params: summaryLogsYearCreateParamsSchema,
      payload: summaryLogsYearCreatePayloadSchema
    }
  },
  /**
   * @param {HapiRequest<SummaryLogsYearCreatePayload> & {
   *   params: { organisationId: string, registrationId: string, year: number },
   *   app: { summaryLogCallbackUrl?: (summaryLogId: string) => string },
   *   uploadsRepository: UploadsRepository,
   *   organisationsRepository: OrganisationsRepository
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      uploadsRepository,
      organisationsRepository,
      params,
      payload,
      logger
    } = request
    const { organisationId, registrationId, year } = params
    const { redirectUrl } = payload

    const organisation = await organisationsRepository.findById(organisationId)
    const registration = organisation.registrations?.find(
      (r) => r.id === registrationId
    )

    if (!registration) {
      throw Boom.notFound(`Registration with id ${registrationId} not found`)
    }

    const eligibility = checkSummaryLogUploadEligibility({
      registration,
      year
    })

    if (!eligibility.eligible) {
      throw Boom.badData(eligibility.reason)
    }

    const result = await createSummaryLogUpload({
      uploadsRepository,
      logger,
      organisationId,
      registrationId,
      year,
      redirectUrl,
      routePath: summaryLogsYearCreatePath,
      callbackUrlFor: request.app.summaryLogCallbackUrl
    })

    return h.response(result).code(StatusCodes.CREATED)
  }
}
