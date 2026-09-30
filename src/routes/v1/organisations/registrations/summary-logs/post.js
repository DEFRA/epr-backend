import { StatusCodes } from 'http-status-codes'

import { summaryLogsCreatePayloadSchema } from './post.schema.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { createSummaryLogUpload } from './create-summary-log-upload.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { UploadsRepository } from '#domain/uploads/repository/port.js' */

/**
 * @typedef {{redirectUrl: string}} SummaryLogsCreatePayload
 */

export const summaryLogsCreatePath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs'

/**
 * Deprecated: superseded by the year/accreditation-scoped create route
 * (`{year}/accreditations/{accreditationId}/summary-logs`). Kept until every
 * consumer has migrated (tracked separately). It never asked the caller for
 * a year or accreditation, so it stores neither — the summary log stays
 * unscoped, and `validate.js` resolves the registration's live accreditation
 * fresh, at validate time, exactly as it did before scoping existed.
 */
export const summaryLogsCreate = {
  method: 'POST',
  path: summaryLogsCreatePath,
  options: {
    auth: getAuthConfig([SCOPES.organisationWrite]),
    tags: ['api'],
    validate: {
      payload: summaryLogsCreatePayloadSchema
    }
  },
  /**
   * @param {HapiRequest<SummaryLogsCreatePayload> & {
   *   params: { organisationId: string, registrationId: string },
   *   uploadsRepository: UploadsRepository
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { uploadsRepository, params, payload, logger } = request
    const { organisationId, registrationId } = params
    const { redirectUrl } = payload

    const result = await createSummaryLogUpload({
      uploadsRepository,
      logger,
      organisationId,
      registrationId,
      redirectUrl,
      routePath: summaryLogsCreatePath
    })

    return h.response(result).code(StatusCodes.CREATED)
  }
}
