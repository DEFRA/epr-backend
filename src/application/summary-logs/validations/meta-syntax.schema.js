import Joi from 'joi'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { customJoi } from '#common/validation/custom-joi.js'

const ALWAYS_VALID_PROCESSING_TYPES = [
  PROCESSING_TYPES.REPROCESSOR_INPUT,
  PROCESSING_TYPES.REPROCESSOR_OUTPUT,
  PROCESSING_TYPES.EXPORTER
]

const REGISTERED_ONLY_PROCESSING_TYPES = [
  PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
  PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
]

const IS_REQUIRED = 'is required'

/**
 * Creates a Joi schema for meta section fields
 * Valid processing types vary based on feature flags
 *
 * @param {Object} [options]
 * @param {boolean} [options.registeredOnlyEnabled] - Whether registered-only processing types are accepted
 * @param {Record<string, number>} [options.minTemplateVersions] - Minimum template version per processing type
 * @returns {Joi.ObjectSchema}
 */
export const createMetaSchema = ({
  registeredOnlyEnabled,
  minTemplateVersions = {}
} = {}) => {
  const validTypes = registeredOnlyEnabled
    ? [...ALWAYS_VALID_PROCESSING_TYPES, ...REGISTERED_ONLY_PROCESSING_TYPES]
    : ALWAYS_VALID_PROCESSING_TYPES

  return Joi.object({
    PROCESSING_TYPE: customJoi
      .coercedString()
      .valid(...validTypes)
      .required()
      .messages({
        'any.only': `must be one of: ${validTypes.join(', ')}`,
        'any.required': IS_REQUIRED
      }),
    TEMPLATE_VERSION: Joi.number()
      .required()
      .when('PROCESSING_TYPE', {
        switch: Object.entries(minTemplateVersions).map(([type, min]) => ({
          is: type,
          then: Joi.number()
            .min(min)
            .messages({ 'number.min': `must be at least ${min}` })
        })),
        otherwise: Joi.number()
          .min(Math.max(...Object.values(minTemplateVersions), 1))
          .messages({ 'number.min': 'must be a supported template version' })
      })
      .messages({
        'any.required': IS_REQUIRED
      }),
    REGISTRATION_NUMBER: customJoi.coercedString().required().messages({
      'any.required': IS_REQUIRED
    }),
    ACCREDITATION_NUMBER: customJoi.coercedString().optional().allow(null, '')
  }).unknown(true) // Allow other fields that might be present
}
