import Joi from 'joi'

const UPLOAD_FILE_STATUS = {
  COMPLETE: 'complete',
  REJECTED: 'rejected',
  PENDING: 'pending'
}

const fileSchema = Joi.object({
  fileId: Joi.string().required(),
  filename: Joi.string().required(),
  fileStatus: Joi.string()
    .valid(
      UPLOAD_FILE_STATUS.COMPLETE,
      UPLOAD_FILE_STATUS.REJECTED,
      UPLOAD_FILE_STATUS.PENDING
    )
    .required(),
  s3Bucket: Joi.string().when('fileStatus', {
    is: UPLOAD_FILE_STATUS.COMPLETE,
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  s3Key: Joi.string().when('fileStatus', {
    is: UPLOAD_FILE_STATUS.COMPLETE,
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  hasError: Joi.boolean().optional(),
  errorMessage: Joi.string().optional()
})
  .required()
  .unknown(true)

export const orsUploadCompletedPayloadSchema = Joi.object({
  form: Joi.object({
    orsUpload: Joi.alternatives()
      .try(fileSchema, Joi.array().items(fileSchema).min(1))
      .required()
  })
    .required()
    .unknown(true)
})
  .unknown(true)
  .messages({
    'any.required': '{#label} is required',
    'string.empty': '{#label} cannot be empty'
  })

export { UPLOAD_FILE_STATUS }
