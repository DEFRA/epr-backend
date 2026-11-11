import Joi from 'joi'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { customJoi } from '#common/validation/custom-joi.js'
import { templateYear } from '#domain/summary-logs/template-year.js'

/** @import {Template} from '#domain/summary-logs/table-schemas/index.js' */

const VALID_PROCESSING_TYPES = [
  PROCESSING_TYPES.REPROCESSOR_INPUT,
  PROCESSING_TYPES.REPROCESSOR_OUTPUT,
  PROCESSING_TYPES.EXPORTER,
  PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
  PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
]

const IS_REQUIRED = 'is required'

/**
 * Creates a Joi schema for meta section fields
 *
 * TEMPLATE_VERSION must belong to a year with templates, and be at least the
 * minimum version of that year's template for the processing type. When the
 * processing type is not one of the year's, the highest minimum applies.
 *
 * @param {Object} options
 * @param {Record<number, Record<string, Template>>} options.templates - Templates by year, then processing type
 * @returns {Joi.ObjectSchema}
 */
export const createMetaSchema = ({ templates }) => {
  return Joi.object({
    PROCESSING_TYPE: customJoi
      .coercedString()
      .valid(...VALID_PROCESSING_TYPES)
      .required()
      .messages({
        'any.only': `must be one of: ${VALID_PROCESSING_TYPES.join(', ')}`,
        'any.required': IS_REQUIRED
      }),
    TEMPLATE_VERSION: Joi.number()
      .required()
      .custom((version, helpers) => {
        const templatesForYear = templates[templateYear(version)]
        if (!templatesForYear) {
          return helpers.error('templateVersion.year')
        }

        const template =
          templatesForYear[helpers.state.ancestors[0].PROCESSING_TYPE]
        if (!template) {
          const highestMin = Math.max(
            ...Object.values(templatesForYear).map((t) => t.minVersion)
          )
          return version < highestMin
            ? helpers.error('templateVersion.unsupported')
            : version
        }

        return version < template.minVersion
          ? helpers.error('number.min', { limit: template.minVersion })
          : version
      })
      .messages({
        'any.required': IS_REQUIRED,
        'number.min': 'must be at least {#limit}',
        'templateVersion.unsupported': 'must be a supported template version',
        'templateVersion.year': 'must be a template for a supported year'
      }),
    REGISTRATION_NUMBER: customJoi.coercedString().required().messages({
      'any.required': IS_REQUIRED
    }),
    ACCREDITATION_NUMBER: customJoi.coercedString().optional().allow(null, '')
  }).unknown(true) // Allow other fields that might be present
}
