import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { latestOpenYear } from '#common/helpers/dates/latest-open-year.js'
import { checkSummaryLogUploadEligibility } from '#domain/summary-logs/upload-eligibility.js'
import { findOrganisationAndRegistrationReadModels } from '#routes/organisations/natural-keys.js'
import { createSummaryLogUpload } from './create-summary-log-upload.js'
import { summaryLogsYearCreatePayloadSchema } from './year-post.schema.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { UploadsRepository } from '#domain/uploads/repository/port.js' */
/** @import { RegistrationParams } from '#routes/organisations/natural-keys.js' */

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
   *   params: RegistrationParams & { organisationId: string, registrationId: string, year: Year },
   *   app: { summaryLogCallback: (summaryLogId: string) => { url: string, signature: string } },
   *   uploadsRepository: UploadsRepository
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { uploadsRepository, params, payload, logger } = request
    const { organisationId, registrationId, year } = params
    const { redirectUrl } = payload

    const { registration } =
      await findOrganisationAndRegistrationReadModels(request)

    const eligibility = checkSummaryLogUploadEligibility({
      registration,
      year,
      latestOpenYear: latestOpenYear()
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
      callbackFor: request.app.summaryLogCallback
    })

    return h.response(result).code(StatusCodes.CREATED)
  }
}
