import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import {
  UPLOAD_STATUS,
  SUMMARY_LOG_STATUS,
  determineSummaryLogStatus
} from '#common/enums/index.js'

/** @typedef {import('#repositories/summary-logs-repository.port.js').SummaryLogsRepository} SummaryLogsRepository */

const uploadCompletedPayloadSchema = Joi.object({
  form: Joi.object({
    file: Joi.object({
      fileId: Joi.string().required(),
      filename: Joi.string().required(),
      fileStatus: Joi.string()
        .valid(UPLOAD_STATUS.COMPLETE, UPLOAD_STATUS.REJECTED)
        .required(),
      s3Bucket: Joi.string().required(),
      s3Key: Joi.string().required()
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

    const existingSummaryLog =
      await summaryLogsRepository.findBySummaryLogId(summaryLogId)

    if (existingSummaryLog) {
      throw Boom.conflict(
        `Summary log ${summaryLogId} already exists with status ${existingSummaryLog.status}`
      )
    }

    const status = determineSummaryLogStatus(fileStatus)

    await summaryLogsRepository.insert({
      summaryLogId,
      status,
      ...(status === SUMMARY_LOG_STATUS.REJECTED && {
        failureReason: 'File rejected by virus scan'
      }),
      file: {
        id: fileId,
        name: filename,
        status: fileStatus,
        s3: {
          bucket: s3Bucket,
          key: s3Key
        }
      }
    })

    return h.response().code(StatusCodes.OK)
  }
}
