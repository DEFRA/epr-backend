import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import {
  determineStatusFromUpload,
  determineFailureReason,
  UPLOAD_STATUS
} from '#domain/summary-log.js'
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
      }),
      hasError: Joi.boolean().optional(),
      errorMessage: Joi.string().optional()
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
   * @param {import('#common/hapi-types.js').HapiRequest & {summaryLogsRepository: SummaryLogsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async ({ summaryLogsRepository, payload, params, logger }, h) => {
    const { summaryLogId } = params
    const {
      file: { fileId, filename, fileStatus, s3Bucket, s3Key, errorMessage }
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
