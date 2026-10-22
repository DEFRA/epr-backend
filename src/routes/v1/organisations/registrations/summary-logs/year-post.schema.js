import Joi from 'joi'

export const summaryLogsYearCreatePayloadSchema = Joi.object({
  redirectUrl: Joi.string().required()
}).messages({
  'any.required': '{#label} is required'
})
