import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

/** @typedef {import('#repositories/summary-logs-repository.port.js').SummaryLogsRepository} SummaryLogsRepository */

const uploadCompletedPayloadSchema = Joi.object({
  form: Joi.object({
    file: Joi.object({
      fileId: Joi.string().required(),
      filename: Joi.string().required(),
      fileStatus: Joi.string().valid('complete', 'rejected').required(),
      s3Bucket: Joi.string().when('fileStatus', {
        is: 'complete',
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
      s3Key: Joi.string().when('fileStatus', {
        is: 'complete',
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

    const fileData = {
      id: fileId,
      name: filename,
      status: fileStatus
    }

    if (fileStatus === 'complete' && s3Bucket && s3Key) {
      fileData.s3 = {
        bucket: s3Bucket,
        key: s3Key
      }
    }

    await summaryLogsRepository.insert({
      summaryLogId,
      file: fileData
    })

    return h.response().code(StatusCodes.OK)
  }
}
