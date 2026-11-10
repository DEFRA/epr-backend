/** @import {SummaryLogId} from '#domain/summary-logs/ids.js' */
import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { summaryLogMetrics } from '#application/summary-logs/metrics.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import {
  isUploadedTo,
  summaryLogUploadPath
} from '#domain/uploads/upload-locations.js'
import { config } from '#root/config.js'
import { findOrganisationAndRegistrationReadModels } from '#routes/organisations/natural-keys.js'
import {
  formatS3Info,
  updateStatusBasedOnUpload
} from './update-status-based-on-upload.js'
import { uploadCompletedPayloadSchema } from './year-post.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { RequiredNumbers } from '#domain/organisations/numbers.js' */
/** @import { SummaryLogsCommandExecutor } from '#domain/summary-logs/worker/port.js' */
/** @import { AccreditationCommon } from '#organisation-read-model/domain/model.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { RegistrationParams } from '#routes/organisations/natural-keys.js' */
/** @import { SummaryLogUpload } from './year-post.schema.js' */

/**
 * @typedef {{form: {summaryLogUpload: SummaryLogUpload}}} UploadCompletedPayload
 *
 * @typedef {HapiRequest<UploadCompletedPayload> & {
 *   params: RegistrationParams & { organisationId: string, registrationId: string, year: Year, summaryLogId: SummaryLogId, accreditationId: string | null },
 *   summaryLogsRepository: SummaryLogsRepository,
 *   summaryLogsWorker: SummaryLogsCommandExecutor
 * }} UploadCompletedRequest
 */

const FAILURE_MESSAGE = 'Failure completing summary log upload'

/**
 * A registered-only upload has no accreditation number, whatever the
 * registration's accreditation for the year.
 *
 * @param {UploadCompletedRequest} request
 * @returns {Promise<RequiredNumbers>}
 */
const numbersFromPath = async (request) => {
  const { organisationNumber, registrationNumber, year, accreditationId } =
    request.params
  const { registration } =
    await findOrganisationAndRegistrationReadModels(request)

  return {
    organisationNumber,
    registrationNumber,
    accreditationNumber:
      accreditationId === null
        ? null
        : /** @type {AccreditationCommon} */ (registration.accreditations[year])
            .accreditationNumber
  }
}

/**
 * Only a completed upload names an S3 location to check.
 *
 * @param {SummaryLogUpload} upload
 * @param {{ organisationId: string, registrationId: string }} ids
 * @returns {boolean}
 */
const isUploadedForRegistration = (upload, ids) =>
  upload.fileStatus !== UPLOAD_STATUS.COMPLETE ||
  isUploadedTo(upload, {
    bucket: config.get('cdpUploader.summaryLogsBucket'),
    path: summaryLogUploadPath(ids)
  })

/**
 * The callback for an upload, under the address it was started at. The path
 * carries the year and names the accreditation (`null` for registered-only).
 */
export const summaryLogsUploadCompletedYear = {
  method: 'POST',
  options: {
    auth: false,
    validate: {
      payload: uploadCompletedPayloadSchema
    }
  },
  /**
   * @param {UploadCompletedRequest} request
   * @param {HapiResponseToolkit} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      summaryLogsRepository,
      summaryLogsWorker,
      payload,
      params,
      logger
    } = request

    const {
      summaryLogId,
      organisationId,
      registrationId,
      year,
      accreditationId
    } = params
    const { summaryLogUpload } = payload.form

    if (
      !isUploadedForRegistration(summaryLogUpload, {
        organisationId,
        registrationId
      })
    ) {
      throw Boom.badData(
        'Upload is not in the upload location for this registration'
      )
    }

    try {
      const status = await updateStatusBasedOnUpload(
        summaryLogsRepository,
        summaryLogId,
        summaryLogUpload,
        logger,
        {
          organisationId,
          registrationId,
          year,
          accreditationId,
          numbers: await numbersFromPath(request)
        }
      )

      await summaryLogMetrics.recordStatusTransition({ status })

      if (status === SUMMARY_LOG_STATUS.VALIDATING) {
        await summaryLogsWorker.validate(summaryLogId)
      }

      const s3Info = formatS3Info(summaryLogUpload)

      logger.info({
        message: `File upload completed: summaryLogId=${summaryLogId}, fileId=${summaryLogUpload.fileId}, filename=${summaryLogUpload.filename}, status=${summaryLogUpload.fileStatus}${s3Info}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: summaryLogId
        }
      })

      return h.response().code(StatusCodes.ACCEPTED)
    } catch (error) {
      if (Boom.isBoom(error)) {
        throw error
      }

      logger.error({
        err: /** @type {Error} */ (error),
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
}
