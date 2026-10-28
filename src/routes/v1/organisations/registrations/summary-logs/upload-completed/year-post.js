import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { summaryLogMetrics } from '#application/summary-logs/metrics.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import {
  formatS3Info,
  updateStatusBasedOnUpload
} from './update-status-based-on-upload.js'
import { uploadCompletedPayloadSchema } from './year-post.schema.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { SummaryLogsCommandExecutor } from '#domain/summary-logs/worker/port.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SummaryLogUpload } from './year-post.schema.js' */

/**
 * @typedef {{form: {summaryLogUpload: SummaryLogUpload}}} UploadCompletedPayload
 */

const FAILURE_MESSAGE = 'Failure completing summary log upload'

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
   * @param {HapiRequest<UploadCompletedPayload> & {
   *   params: { organisationId: string, registrationId: string, year: Year, summaryLogId: string, accreditationId: string | null },
   *   summaryLogsRepository: SummaryLogsRepository,
   *   organisationsRepository: OrganisationsRepository,
   *   summaryLogsWorker: SummaryLogsCommandExecutor
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      summaryLogsRepository,
      organisationsRepository,
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

    try {
      const status = await updateStatusBasedOnUpload(
        summaryLogsRepository,
        organisationsRepository,
        summaryLogId,
        summaryLogUpload,
        logger,
        { organisationId, registrationId, year, accreditationId }
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
}
