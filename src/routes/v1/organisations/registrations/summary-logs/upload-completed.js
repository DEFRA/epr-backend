import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  determineFailureReason,
  determineStatusFromUpload,
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-log.js'

import { uploadCompletedPayloadSchema } from './upload-completed.schema.js'

/** @typedef {import('#repositories/summary-logs-repository.port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#workers/summary-logs/validator/summary-logs-validator.port.js').SummaryLogsValidator} SummaryLogsValidator */

export const summaryLogsUploadCompletedPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}/upload-completed'

export const summaryLogsUploadCompleted = {
  method: 'POST',
  path: summaryLogsUploadCompletedPath,
  options: {
    validate: {
      payload: uploadCompletedPayloadSchema,
      failAction: (_request, _h, err) => {
        throw Boom.badData(err.message)
      }
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {summaryLogsRepository: SummaryLogsRepository} & {summaryLogsValidator: SummaryLogsValidator}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      summaryLogsRepository,
      summaryLogsValidator,
      payload,
      params,
      logger
    } = request

    const { summaryLogId } = params

    const {
      form: {
        summaryLogUpload: {
          fileId,
          filename,
          fileStatus,
          s3Bucket,
          s3Key,
          errorMessage
        }
      }
    } = payload

    try {
      const existingSummaryLog =
        await summaryLogsRepository.findById(summaryLogId)

      if (existingSummaryLog) {
        throw Boom.conflict(
          `Summary log ${summaryLogId} already exists with status ${existingSummaryLog.status}`
        )
      }

      const status = determineStatusFromUpload(fileStatus)
      const failureReason = determineFailureReason(status, errorMessage)

      const fileData = {
        id: fileId,
        name: filename,
        status: fileStatus
      }

      if (fileStatus === UPLOAD_STATUS.COMPLETE) {
        fileData.s3 = {
          bucket: s3Bucket,
          key: s3Key
        }
      }

      const summaryLog = {
        id: summaryLogId,
        status,
        file: fileData
      }

      if (failureReason) {
        summaryLog.failureReason = failureReason
      }

      await summaryLogsRepository.insert(summaryLog)

      if (status === SUMMARY_LOG_STATUS.VALIDATING) {
        await summaryLogsValidator.validate(summaryLog)
      }

      const s3Info =
        fileStatus === UPLOAD_STATUS.COMPLETE && s3Bucket && s3Key
          ? `, s3Bucket=${s3Bucket}, s3Key=${s3Key}`
          : ''

      logger.info({
        message: `File upload completed: summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}, status=${fileStatus}${s3Info}`,
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

      const message = `Failure on ${summaryLogsUploadCompletedPath}`

      logger.error({
        error,
        message,
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

      throw Boom.badImplementation(message)
    }
  }
}
