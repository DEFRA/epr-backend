import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import {
  determineStatusFromUpload,
  determineFailureReason,
  UPLOAD_STATUS
} from '#domain/summary-log.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

/** @typedef {import('#repositories/summary-logs-repository.port.js').SummaryLogsRepository} SummaryLogsRepository */

const uploadCompletedPayloadSchema = Joi.object({
  form: Joi.object({
    file: Joi.object({
      fileId: Joi.string().required(),
      filename: Joi.string().required(),
      fileStatus: Joi.string()
        .valid(
          UPLOAD_STATUS.COMPLETE,
          UPLOAD_STATUS.REJECTED,
          UPLOAD_STATUS.PENDING
        )
        .required(),
      s3Bucket: Joi.string().when('fileStatus', {
        is: UPLOAD_STATUS.COMPLETE,
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
      s3Key: Joi.string().when('fileStatus', {
        is: UPLOAD_STATUS.COMPLETE,
        then: Joi.required(),
        otherwise: Joi.optional()
      })
    })
      .required()
      .unknown(true)
  })
    .required()
    .unknown(true)
})
  .unknown(true)
  .messages({
    'any.required': '{#label} is required',
    'string.empty': '{#label} cannot be empty'
  })

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
   * @param {Object} request
   * @param {SummaryLogsRepository} request.summaryLogsRepository
   * @param {Object} request.payload
   * @param {Object} request.params
   * @param {Object} h - Hapi response toolkit
   */
  handler: async ({ summaryLogsRepository, payload, params }, h) => {
    const { summaryLogId } = params
    const {
      file: { fileId, filename, fileStatus, s3Bucket, s3Key }
    } = payload.form

    try {
      const existingSummaryLog =
        await summaryLogsRepository.findById(summaryLogId)

      if (existingSummaryLog) {
        throw Boom.conflict(
          `Summary log ${summaryLogId} already exists with status ${existingSummaryLog.status}`
        )
      }

      const status = determineStatusFromUpload(fileStatus)
      const failureReason = determineFailureReason(status)

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

      const logContext = {
        summaryLogId,
        fileId,
        filename,
        fileStatus
      }

      if (fileStatus === UPLOAD_STATUS.COMPLETE && s3Bucket && s3Key) {
        logContext.s3Bucket = s3Bucket
        logContext.s3Key = s3Key
      }

      const s3Info =
        fileStatus === UPLOAD_STATUS.COMPLETE && s3Bucket && s3Key
          ? `, s3: bucket ${s3Bucket}, key ${s3Key}`
          : ''

      logger.info(
        {
          event: { category: 'summary-logs', action: 'request_success' },
          context: logContext
        },
        `File upload completed for summaryLogId: ${summaryLogId} with fileId: ${fileId}, filename: ${filename}, status: ${fileStatus}${s3Info}`
      )

      return h.response().code(StatusCodes.OK)
    } catch (err) {
      if (err.isBoom) {
        throw err
      }

      const message = `Failure on ${summaryLogsUploadCompletedPath}`

      logger.error(err, {
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
