import Joi from 'joi'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { customJoi } from '#common/validation/custom-joi.js'

const VALID_PROCESSING_TYPES = Object.values(PROCESSING_TYPES)

const MAX_MATERIAL_LENGTH = 50

const MIN_TEMPLATE_VERSION = 5

const IS_REQUIRED = 'is required'

/**
 * Joi schema for meta section fields
 * This validates the syntax and format of meta fields to prevent malicious input
 */
export const metaSchema = Joi.object({
  PROCESSING_TYPE: customJoi
    .coercedString()
    .valid(...VALID_PROCESSING_TYPES)
    .required()
    .messages({
      'any.only': `must be one of: ${VALID_PROCESSING_TYPES.join(', ')}`,
      'any.required': IS_REQUIRED
    }),
  TEMPLATE_VERSION: Joi.number()
    .min(MIN_TEMPLATE_VERSION)
    .required()
    .messages({
      'number.min': `must be at least ${MIN_TEMPLATE_VERSION}`,
      'any.required': IS_REQUIRED
    }),
  MATERIAL: customJoi
    .coercedString()
    .max(MAX_MATERIAL_LENGTH)
    .required()
    .messages({
      'string.max': `must be at most ${MAX_MATERIAL_LENGTH} characters`,
      'any.required': IS_REQUIRED
    }),
  REGISTRATION_NUMBER: customJoi.coercedString().required().messages({
    'any.required': IS_REQUIRED
  }),
  ACCREDITATION_NUMBER: customJoi.coercedString().optional().allow(null, '')
}).unknown(true) // Allow other fields that might be present
