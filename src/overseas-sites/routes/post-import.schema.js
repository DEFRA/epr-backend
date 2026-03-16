import Joi from 'joi'

export const orsImportCreatePayloadSchema = Joi.object({
  redirectUrl: Joi.string().required()
}).messages({
  'any.required': '{#label} is required'
})
