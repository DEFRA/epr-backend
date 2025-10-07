import Boom from '@hapi/boom'
import Joi from 'joi'

const summaryLogInsertSchema = Joi.object({
  summaryLogId: Joi.string().optional(),
  fileId: Joi.string().required(),
  filename: Joi.string().required(),
  fileStatus: Joi.string().valid('complete', 'rejected').optional(),
  s3Bucket: Joi.string().required(),
  s3Key: Joi.string().required(),
  organisationId: Joi.string().optional(),
  registrationId: Joi.string().optional()
}).messages({
  'any.required': '{#label} is required',
  'string.empty': '{#label} cannot be empty',
  'any.only': '{#label} must be one of {#valids}'
})

export const validateSummaryLogInsert = (data) => {
  const { error, value } = summaryLogInsertSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badData(`Invalid summary log data: ${details}`)
  }

  return value
}
