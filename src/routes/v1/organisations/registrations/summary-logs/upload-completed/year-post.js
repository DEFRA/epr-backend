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
import {
  uploadCompletedPayloadSchema,
  uploadCompletedYearParamsSchema
} from './year-post.schema.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { SummaryLogsCommandExecutor } from '#domain/summary-logs/worker/port.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SummaryLogUpload } from './post.schema.js' */

/**
 * @typedef {{form: {summaryLogUpload: SummaryLogUpload}}} UploadCompletedPayload
 */

export const summaryLogsUploadCompletedYearPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{year}/{summaryLogId}/upload-completed'

/**
 * The callback for an upload that started via the year-scoped create route.
 * `year` is carried on the path rather than a query string, since every
 * upload reaching this route already knows it at create time. Which
 * accreditation the upload belongs to isn't carried either — it's the
 * registration's current live link, fetched here.
 */
export const summaryLogsUploadCompletedYear = {
  method: 'POST',
  path: summaryLogsUploadCompletedYearPath,
  options: {
    auth: false,
    validate: {
      params: uploadCompletedYearParamsSchema,
      payload: uploadCompletedPayloadSchema
    }
  },
  /**
   * @param {HapiRequest<UploadCompletedPayload> & {
   *   params: { organisationId: string, registrationId: string, year: number, summaryLogId: string },
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

    const { summaryLogId, organisationId, registrationId, year } = params
    const { summaryLogUpload } = payload.form

    try {
      const status = await updateStatusBasedOnUpload(
        summaryLogsRepository,
        organisationsRepository,
        summaryLogId,
        summaryLogUpload,
        logger,
        organisationId,
        registrationId,
        year
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
        message: `Failure on ${summaryLogsUploadCompletedYearPath}`,
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

      throw Boom.badImplementation(
        `Failure on ${summaryLogsUploadCompletedYearPath}`
      )
    }
  }
}
