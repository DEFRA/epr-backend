import Joi from 'joi'

import { UPLOAD_STATUS } from '#domain/summary-logs/status.js'

/**
 * @typedef {Object} SummaryLogUpload
 * @property {string} fileId
 * @property {string} filename
 * @property {string} fileStatus
 * @property {string} [s3Bucket]
 * @property {string} [s3Key]
 * @property {boolean} [hasError]
 * @property {string} [errorMessage]
 */

export const uploadCompletedPayloadSchema = Joi.object({
  form: Joi.object({
    summaryLogUpload: Joi.object({
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
