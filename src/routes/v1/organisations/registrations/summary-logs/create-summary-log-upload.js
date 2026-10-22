import { randomUUID } from 'node:crypto'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { UploadsRepository } from '#domain/uploads/repository/port.js' */

const FAILURE_MESSAGE = 'Failure initiating summary log upload'

/**
 * Initiates a summary log upload: mints an id, builds the upload-completed
 * callback, and asks the uploads repository for a CDP upload session.
 *
 * The callback carries the year and accreditation the upload was started
 * under, so the eventual insert knows which it belongs to.
 *
 * @param {{
 *   uploadsRepository: UploadsRepository,
 *   logger: TypedLogger,
 *   organisationId: string,
 *   registrationId: string,
 *   redirectUrl: string,
 *   callbackUrlFor: (summaryLogId: string) => string
 * }} args
 * @returns {Promise<{ summaryLogId: string, uploadId: string, uploadUrl: string, statusUrl: string }>}
 */
export async function createSummaryLogUpload({
  uploadsRepository,
  logger,
  organisationId,
  registrationId,
  redirectUrl,
  callbackUrlFor
}) {
  const summaryLogId = randomUUID()
  const resolvedRedirectUrl = redirectUrl.replace(
    '{summaryLogId}',
    summaryLogId
  )
  const callbackUrl = callbackUrlFor(summaryLogId)

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
