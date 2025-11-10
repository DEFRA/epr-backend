import Joi from 'joi'

/**
 * Constants for SONAR...
 */
const MAX_MATERIAL_LENGTH = 50
const MAX_PROCESSING_TYPE_LENGTH = 30

const MIN_TEMPLATE_VERSION = 1

const IS_REQUIRED = 'is required'

/**
 * Joi schema for meta section fields
 * This validates the syntax and format of meta fields to prevent malicious input
 */
export const metaSchema = Joi.object({
  PROCESSING_TYPE: Joi.string()
    .max(MAX_PROCESSING_TYPE_LENGTH)
    .pattern(/^[A-Z0-9_]+$/)
    .required()
    .messages({
      'string.max': 'must be at most 30 characters',
      'string.pattern.base':
        'must be in SCREAMING_SNAKE_CASE format (uppercase letters, numbers, and underscores only)',
      'any.required': IS_REQUIRED
    }),
  TEMPLATE_VERSION: Joi.number().min(MIN_TEMPLATE_VERSION).required().messages({
    'number.min': 'must be at least 1',
    'any.required': IS_REQUIRED
  }),
  MATERIAL: Joi.string().max(MAX_MATERIAL_LENGTH).required().messages({
    'string.max': 'must be at most 50 characters',
    'any.required': IS_REQUIRED
  }),
  ACCREDITATION: Joi.string().optional().allow(null, ''),
  REGISTRATION: Joi.string().required().messages({
    'any.required': IS_REQUIRED
  })
}).unknown(true) // Allow other fields that might be present
