import Joi from 'joi'

export const summaryLogsCreatePayloadSchema = Joi.object({
  redirectUrl: Joi.string().required()
}).messages({
  'any.required': '{#label} is required'
})
