import Boom from '@hapi/boom'
import Joi from 'joi'

const summaryLogInsertSchema = Joi.object({
  summaryLogId: Joi.string().optional(),
  file: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
    status: Joi.string().valid('complete', 'pending', 'rejected').optional(),
    s3: Joi.object({
      bucket: Joi.string().required(),
      key: Joi.string().required()
    }).when('status', {
      is: 'complete',
      then: Joi.required(),
      otherwise: Joi.optional()
    })
  }).required(),
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
