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
 * The year-scoped callback URL CDP Uploader calls once the file lands,
 * matching the year-scoped `upload-completed` route.
 *
 * @param {{
 *   appBaseUrl: string,
 *   organisationId: string,
 *   registrationId: string,
 *   summaryLogId: string,
 *   year: number
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
  `${appBaseUrl}/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${year}/${summaryLogId}/upload-completed`

/**
 * Initiates a summary log upload: mints an id, builds the upload-completed
 * callback, and asks the uploads repository for a CDP upload session.
 *
 * The year-scoped create route has already validated eligibility for `year`,
 * so it is passed through to mint the year-scoped callback, letting the
 * eventual insert know which year it belongs to. The accreditation is
 * stamped at upload-completed.
 *
 * @param {{
 *   uploadsRepository: UploadsRepository,
 *   logger: TypedLogger,
 *   organisationId: string,
 *   registrationId: string,
 *   year: number,
 *   redirectUrl: string,
 *   routePath: string,
 *   callbackUrlFor?: (summaryLogId: string) => string
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
  routePath,
  callbackUrlFor
}) {
  const summaryLogId = randomUUID()
  const resolvedRedirectUrl = redirectUrl.replace(
    '{summaryLogId}',
    summaryLogId
  )
  const callbackUrl =
    callbackUrlFor?.(summaryLogId) ??
    buildCallbackUrl({
      appBaseUrl: config.get('appBaseUrl'),
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
