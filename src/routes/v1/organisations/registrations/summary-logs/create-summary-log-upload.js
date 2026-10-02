import { randomUUID } from 'node:crypto'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { config } from '#root/config.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { UploadsRepository } from '#domain/uploads/repository/port.js' */

/**
 * The callback URL CDP Uploader calls once the file lands: the year-scoped
 * path when `year` is given, matching the year-scoped `upload-completed`
 * route; otherwise the legacy org/registration-scoped path, matching the
 * deprecated `upload-completed` route the legacy create route still uses.
 *
 * @param {{
 *   appBaseUrl: string,
 *   organisationId: string,
 *   registrationId: string,
 *   summaryLogId: string,
 *   year?: number
 * }} args
 * @returns {string}
 */
const buildCallbackUrl = ({
  appBaseUrl,
  organisationId,
  registrationId,
  summaryLogId,
  year
}) =>
  year === undefined
    ? `${appBaseUrl}/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`
    : `${appBaseUrl}/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${year}/${summaryLogId}/upload-completed`

/**
 * Initiates a summary log upload: mints an id, builds the upload-completed
 * callback, and asks the uploads repository for a CDP upload session.
 *
 * Shared by both the year-scoped create route and the legacy
 * org/registration-scoped one. The scoped route has already validated
 * eligibility for a specific `year`, so it passes it through here to mint the
 * year-scoped callback, letting the eventual insert know which year it
 * belongs to — the accreditation is stamped at upload-completed from the
 * registration's current accreditation link. The legacy route never asked for a specific year, so it
 * omits it — the summary log is then stored unscoped, and `validate.js`
 * resolves the registration's live accreditation itself, fresh, when
 * validation runs.
 *
 * @param {{
 *   uploadsRepository: UploadsRepository,
 *   logger: TypedLogger,
 *   organisationId: string,
 *   registrationId: string,
 *   year?: number,
 *   redirectUrl: string,
 *   routePath: string
 * }} args
 * @returns {Promise<{ summaryLogId: string, uploadId: string, uploadUrl: string, statusUrl: string }>}
 */
export async function createSummaryLogUpload({
  uploadsRepository,
  logger,
  organisationId,
  registrationId,
  year,
  redirectUrl,
  routePath
}) {
  const summaryLogId = randomUUID()
  const resolvedRedirectUrl = redirectUrl.replace(
    '{summaryLogId}',
    summaryLogId
  )
  const appBaseUrl = config.get('appBaseUrl')
  const callbackUrl = buildCallbackUrl({
    appBaseUrl,
    organisationId,
    registrationId,
    summaryLogId,
    year
  })

  try {
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

    return {
      summaryLogId,
      uploadId: cdpResponse.uploadId,
      uploadUrl: cdpResponse.uploadUrl,
      statusUrl: cdpResponse.statusUrl
    }
  } catch (error) {
    if (error.isBoom) {
      throw error
    }

    logger.error({
      err: error,
      message: `Failure on ${routePath}`,
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

    throw Boom.badImplementation(`Failure on ${routePath}`)
  }
}
