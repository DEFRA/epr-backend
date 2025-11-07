import Joi from 'joi'

/**
 * Joi schema for meta section fields
 * This validates the syntax and format of meta fields to prevent malicious input
 */
export const metaSchema = Joi.object({
  PROCESSING_TYPE: Joi.string()
    .max(30)
    .pattern(/^[A-Z0-9_]+$/)
    .required()
    .messages({
      'string.max': 'must be at most 30 characters',
      'string.pattern.base':
        'must be in SCREAMING_SNAKE_CASE format (uppercase letters, numbers, and underscores only)',
      'any.required': 'is required'
    }),
  TEMPLATE_VERSION: Joi.number().min(1).required().messages({
    'number.min': 'must be at least 1',
    'any.required': 'is required'
  }),
  MATERIAL: Joi.string().max(50).required().messages({
    'string.max': 'must be at most 50 characters',
    'any.required': 'is required'
  }),
  ACCREDITATION: Joi.string().optional().allow(null, ''),
  REGISTRATION: Joi.string().required().messages({
    'any.required': 'is required'
  })
}).unknown(true) // Allow other fields that might be present
