import Joi from 'joi'

export const summaryLogsCreatePayloadSchema = Joi.object({
  redirectUrl: Joi.string().uri().required()
}).messages({
  'any.required': '{#label} is required',
  'string.uri': '{#label} must be a valid URI'
})
