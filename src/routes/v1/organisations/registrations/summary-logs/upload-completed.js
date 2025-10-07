import Boom from '@hapi/boom'
import Joi from 'joi'

/** @typedef {import('#repositories/summary-logs-repository.port.js').SummaryLogsRepository} SummaryLogsRepository */

const uploadCompletedPayloadSchema = Joi.object({
  form: Joi.object({
    file: Joi.object({
      fileId: Joi.string().required(),
      filename: Joi.string().required(),
      fileStatus: Joi.string().valid('complete', 'rejected').required(),
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
      failAction: (request, h, err) => {
        throw Boom.badRequest(`Validation failed: ${err.message}`)
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
    const { file } = payload.form

    await summaryLogsRepository.insert({
      summaryLogId,
      fileId: file.fileId,
      filename: file.filename,
      fileStatus: file.fileStatus,
      s3Bucket: file.s3Bucket,
      s3Key: file.s3Key
    })

    return h.response().code(200)
  }
}
