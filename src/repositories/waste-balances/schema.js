import Joi from 'joi'

export const accreditationIdSchema = Joi.string().required().messages({
  'any.required': 'accreditationId is required',
  'string.empty': 'accreditationId cannot be empty',
  'string.base': 'accreditationId must be a string'
})
