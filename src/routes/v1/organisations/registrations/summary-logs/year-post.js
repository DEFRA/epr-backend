import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { checkSummaryLogUploadEligibility } from '#domain/summary-logs/upload-eligibility.js'
import { createSummaryLogUpload } from './create-summary-log-upload.js'
import { summaryLogsYearCreatePayloadSchema } from './year-post.schema.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { UploadsRepository } from '#domain/uploads/repository/port.js' */
/** @import { ResolvedRecords } from '#routes/organisations/at-natural-keys.js' */

/**
 * @typedef {{redirectUrl: string}} SummaryLogsYearCreatePayload
 */

/**
 * Which accreditation the upload belongs to isn't asked for here: it is
 * stamped at upload-completed, from the natural-key path.
 */
export const summaryLogsYearCreate = {
  method: 'POST',
  options: {
    auth: getAuthConfig([SCOPES.organisationWrite]),
    tags: ['api'],
    validate: {
      payload: summaryLogsYearCreatePayloadSchema
    }
  },
  /**
   * @param {HapiRequest<SummaryLogsYearCreatePayload> & {
   *   params: { organisationId: string, registrationId: string, year: Year },
   *   app: ResolvedRecords & {
   *     registration: Registration,
   *     summaryLogCallbackUrl: (summaryLogId: string) => string
   *   },
   *   uploadsRepository: UploadsRepository
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { uploadsRepository, params, payload, logger } = request
    const { organisationId, registrationId, year } = params
    const { redirectUrl } = payload
    const { registration } = request.app

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
      redirectUrl,
      callbackUrlFor: request.app.summaryLogCallbackUrl
    })

    return h.response(result).code(StatusCodes.CREATED)
  }
}
